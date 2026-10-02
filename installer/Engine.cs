using System;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Net.Http;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Threading.Tasks;
using System.Windows.Forms;
using Microsoft.Win32;

namespace NelyaSetup
{
    static class Engine
    {
        const string Key = @"Software\Microsoft\Windows\CurrentVersion\Uninstall\nelya";
        const string RuntimeUrl = "https://aka.ms/dotnet/9.0/windowsdesktop-runtime-win-x64.exe";
        public const string Repo = "lynnnawe/nelyalauncher";

        public static string Version
        {
            get
            {
                var v = Assembly.GetExecutingAssembly().GetName().Version;
                return v.Major + "." + v.Minor + "." + v.Build;
            }
        }

        public static string DefaultDir => Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Programs", "nelya");

        public static string InstalledDir()
        {
            using (var key = Registry.CurrentUser.OpenSubKey(Key))
                return key?.GetValue("InstallLocation") as string;
        }

        public static string InstalledVersion()
        {
            using (var key = Registry.CurrentUser.OpenSubKey(Key))
                return key?.GetValue("DisplayVersion") as string;
        }

        public static bool HasRuntime()
        {
            foreach (var root in new[] { Environment.GetEnvironmentVariable("DOTNET_ROOT"), Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), "dotnet") })
            {
                if (string.IsNullOrEmpty(root)) continue;
                var shared = Path.Combine(root, "shared", "Microsoft.WindowsDesktop.App");
                if (Directory.Exists(shared) && Directory.GetDirectories(shared).Any(d => Path.GetFileName(d).StartsWith("9."))) return true;
            }
            return false;
        }

        public static async Task InstallRuntime(Action<string, double> report)
        {
            var file = Path.Combine(Path.GetTempPath(), "nelya-dotnet-desktop-9.exe");
            using (var http = new HttpClient())
            {
                http.DefaultRequestHeaders.UserAgent.ParseAdd("nelya-setup/" + Version);
                using (var res = await http.GetAsync(RuntimeUrl, HttpCompletionOption.ResponseHeadersRead))
                {
                    res.EnsureSuccessStatusCode();
                    var total = res.Content.Headers.ContentLength ?? 60_000_000L;
                    using (var src = await res.Content.ReadAsStreamAsync())
                    using (var dst = File.Create(file))
                    {
                        var buffer = new byte[81920];
                        long done = 0;
                        int n;
                        var last = DateTime.MinValue;
                        while ((n = await src.ReadAsync(buffer, 0, buffer.Length)) > 0)
                        {
                            await dst.WriteAsync(buffer, 0, n);
                            done += n;
                            if ((DateTime.Now - last).TotalMilliseconds > 120)
                            {
                                last = DateTime.Now;
                                report($"downloading the .net 9 runtime, {done / 1048576} of {total / 1048576} mb", 0.05 + 0.45 * done / total);
                            }
                        }
                    }
                }
            }
            report("installing the .net 9 runtime, windows will ask for permission", 0.52);
            int code;
            try
            {
                using (var p = Process.Start(new ProcessStartInfo(file, "/install /quiet /norestart") { UseShellExecute = true, Verb = "runas" }))
                {
                    await Task.Run(() => p.WaitForExit());
                    code = p.ExitCode;
                }
            }
            catch (System.ComponentModel.Win32Exception ex) when (ex.NativeErrorCode == 1223)
            {
                throw new InvalidOperationException("nelya needs the .net 9 runtime and the permission prompt was declined");
            }
            finally
            {
                try { File.Delete(file); } catch { }
            }
            if (code != 0 && code != 3010 && code != 1638 && !HasRuntime()) throw new InvalidOperationException("the .net 9 runtime installer failed with code " + code);
        }

        public static void CloseRunning(string dir)
        {
            foreach (var p in Process.GetProcessesByName("Nelya"))
            {
                try
                {
                    var path = p.MainModule?.FileName;
                    if (path == null || !path.StartsWith(dir.TrimEnd('\\') + "\\", StringComparison.OrdinalIgnoreCase)) continue;
                    p.CloseMainWindow();
                    if (!p.WaitForExit(5000)) p.Kill();
                    p.WaitForExit(3000);
                }
                catch { }
                finally { p.Dispose(); }
            }
        }

        public static void WritePayload(string dir)
        {
            Directory.CreateDirectory(dir);
            var target = Path.Combine(dir, "Nelya.exe");
            var temp = target + ".new";
            using (var src = Assembly.GetExecutingAssembly().GetManifestResourceStream("payload/Nelya.exe"))
            using (var dst = File.Create(temp))
                src.CopyTo(dst);
            if (File.Exists(target))
            {
                try { File.Delete(target); }
                catch
                {
                    var old = target + ".old";
                    if (File.Exists(old)) File.Delete(old);
                    File.Move(target, old);
                }
            }
            File.Move(temp, target);
            var self = Application.ExecutablePath;
            var uninstaller = Path.Combine(dir, "uninstall.exe");
            if (!string.Equals(self, uninstaller, StringComparison.OrdinalIgnoreCase)) File.Copy(self, uninstaller, true);
        }

        static string StartMenuLink => Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Programs), "nelya.lnk");
        static string DesktopLink => Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory), "nelya.lnk");

        public static void Shortcuts(string dir, bool desktop, bool startMenu)
        {
            var exe = Path.Combine(dir, "Nelya.exe");
            if (startMenu) Shortcut(StartMenuLink, exe, dir);
            if (desktop) Shortcut(DesktopLink, exe, dir);
        }

        static void Shortcut(string path, string target, string dir)
        {
            var type = Type.GetTypeFromProgID("WScript.Shell");
            if (type == null) return;
            var shell = Activator.CreateInstance(type);
            try
            {
                var link = type.InvokeMember("CreateShortcut", BindingFlags.InvokeMethod, null, shell, new object[] { path });
                var lt = link.GetType();
                lt.InvokeMember("TargetPath", BindingFlags.SetProperty, null, link, new object[] { target });
                lt.InvokeMember("WorkingDirectory", BindingFlags.SetProperty, null, link, new object[] { dir });
                lt.InvokeMember("IconLocation", BindingFlags.SetProperty, null, link, new object[] { target + ",0" });
                lt.InvokeMember("Description", BindingFlags.SetProperty, null, link, new object[] { "nelya minecraft launcher" });
                lt.InvokeMember("Save", BindingFlags.InvokeMethod, null, link, null);
                Marshal.FinalReleaseComObject(link);
            }
            finally
            {
                Marshal.FinalReleaseComObject(shell);
            }
        }

        public static void Register(string dir)
        {
            var exe = Path.Combine(dir, "Nelya.exe");
            var uninstaller = Path.Combine(dir, "uninstall.exe");
            using (var key = Registry.CurrentUser.CreateSubKey(Key))
            {
                key.SetValue("DisplayName", "nelya");
                key.SetValue("DisplayVersion", Version);
                key.SetValue("Publisher", "lynnnawe");
                key.SetValue("DisplayIcon", exe + ",0");
                key.SetValue("InstallLocation", dir);
                key.SetValue("UninstallString", "\"" + uninstaller + "\" --uninstall");
                key.SetValue("URLInfoAbout", "https://github.com/" + Repo);
                key.SetValue("HelpLink", "https://github.com/" + Repo + "/issues");
                key.SetValue("NoModify", 1, RegistryValueKind.DWord);
                key.SetValue("NoRepair", 1, RegistryValueKind.DWord);
                key.SetValue("InstallDate", DateTime.Now.ToString("yyyyMMdd"));
                var size = Directory.GetFiles(dir).Sum(f => new FileInfo(f).Length) / 1024;
                key.SetValue("EstimatedSize", (int)size, RegistryValueKind.DWord);
            }
        }

        public static void Launch(string dir)
        {
            var exe = Path.Combine(dir, "Nelya.exe");
            if (File.Exists(exe)) Process.Start(new ProcessStartInfo(exe) { UseShellExecute = true, WorkingDirectory = dir });
        }

        public static void Uninstall(string dir, bool wipe, Action<string, double> report)
        {
            report("closing nelya", 0.1);
            CloseRunning(dir);
            report("removing shortcuts", 0.3);
            foreach (var link in new[] { StartMenuLink, DesktopLink })
                try { if (File.Exists(link)) File.Delete(link); } catch { }
            report("removing nelya", 0.5);
            foreach (var name in new[] { "Nelya.exe", "Nelya.exe.old", "Nelya.exe.new", "uninstall.exe" })
                try { File.Delete(Path.Combine(dir, name)); } catch { }
            try { if (Directory.Exists(dir) && !Directory.EnumerateFileSystemEntries(dir).Any()) Directory.Delete(dir); } catch { }
            if (wipe)
            {
                report("deleting instances and settings", 0.7);
                var roaming = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "nelya");
                var local = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "nelya");
                foreach (var d in new[] { roaming, local })
                    try { if (Directory.Exists(d)) Directory.Delete(d, true); } catch { }
            }
            report("cleaning up", 0.9);
            Registry.CurrentUser.DeleteSubKeyTree(Key, false);
            using (var run = Registry.CurrentUser.OpenSubKey(@"Software\Microsoft\Windows\CurrentVersion\Run", true))
                try { run?.DeleteValue("nelya", false); } catch { }
        }

        public static void DeleteSelfLater(string path)
        {
            try
            {
                Process.Start(new ProcessStartInfo("cmd.exe", "/c ping 127.0.0.1 -n 3 > nul & del /f /q \"" + path + "\"")
                {
                    CreateNoWindow = true,
                    UseShellExecute = false,
                    WindowStyle = ProcessWindowStyle.Hidden,
                });
            }
            catch { }
        }
    }
}
