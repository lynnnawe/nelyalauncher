using System;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Net;
using System.Reflection;
using System.Runtime.CompilerServices;
using System.Windows.Forms;

namespace NelyaSetup
{
    static class Program
    {
        [STAThread]
        static int Main(string[] args)
        {
            AppDomain.CurrentDomain.AssemblyResolve += Resolve;
            return Run(args);
        }

        static Assembly Resolve(object sender, ResolveEventArgs e)
        {
            var name = new AssemblyName(e.Name).Name;
            using (var stream = Assembly.GetExecutingAssembly().GetManifestResourceStream("lib/" + name + ".dll"))
            {
                if (stream == null) return null;
                var bytes = new byte[stream.Length];
                var read = 0;
                while (read < bytes.Length) read += stream.Read(bytes, read, bytes.Length - read);
                return Assembly.Load(bytes);
            }
        }

        [MethodImpl(MethodImplOptions.NoInlining)]
        static int Run(string[] args)
        {
            ServicePointManager.SecurityProtocol |= SecurityProtocolType.Tls12 | (SecurityProtocolType)12288;
            var uninstall = args.Contains("--uninstall");
            if (uninstall && !args.Contains("--detached"))
            {
                var self = Application.ExecutablePath;
                var dir = Path.GetDirectoryName(self);
                if (string.Equals(dir.TrimEnd('\\'), Engine.InstalledDir()?.TrimEnd('\\'), StringComparison.OrdinalIgnoreCase))
                {
                    var copy = Path.Combine(Path.GetTempPath(), "nelya-uninstall-" + Guid.NewGuid().ToString("N").Substring(0, 8) + ".exe");
                    File.Copy(self, copy, true);
                    Process.Start(new ProcessStartInfo(copy, "--uninstall --detached") { UseShellExecute = false });
                    return 0;
                }
            }
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            Application.Run(new SetupForm(uninstall));
            if (uninstall && args.Contains("--detached")) Engine.DeleteSelfLater(Application.ExecutablePath);
            return 0;
        }
    }
}
