using System.Diagnostics;
using System.Text.Json.Nodes;

namespace Nelya.Core;

static class Sync
{
    static List<string> Targets()
    {
        var list = new List<string>();
        if (Store.Get("sync") is JsonObject cfg && cfg["targets"] is JsonArray targets)
        {
            foreach (var t in targets.OfType<JsonObject>())
            {
                if (!(Js.B(t["on"]) ?? false)) continue;
                var path = (Js.S(t["path"]) ?? "").Replace('\\', '/').Trim();
                if (path.Length == 0 || path.Contains("..") || Path.IsPathRooted(path)) continue;
                list.Add(path);
            }
        }
        return list;
    }

    static List<string> Members() =>
        (Hub.Settings["syncInstances"] as JsonArray)?.Select(Js.S).Where(s => s != null && Instances.Get(s) != null).Cast<string>().ToList() ?? new();

    static bool IsLink(string path) =>
        Directory.Exists(path) && new DirectoryInfo(path).Attributes.HasFlag(FileAttributes.ReparsePoint);

    static string Local(string id, string target) => Path.Combine(Paths.Game(id), target.TrimEnd('/').Replace('/', Path.DirectorySeparatorChar));

    static string Central(string target) => Path.Combine(Paths.Sync, target.TrimEnd('/').Replace('/', Path.DirectorySeparatorChar));

    static void Junction(string link, string target)
    {
        Directory.CreateDirectory(Path.GetDirectoryName(link)!);
        var psi = new ProcessStartInfo("cmd.exe") { UseShellExecute = false, CreateNoWindow = true };
        psi.ArgumentList.Add("/c");
        psi.ArgumentList.Add("mklink");
        psi.ArgumentList.Add("/J");
        psi.ArgumentList.Add(link);
        psi.ArgumentList.Add(target);
        using var p = Process.Start(psi)!;
        p.WaitForExit(10000);
        if (!Directory.Exists(link)) throw new IOException("could not link " + link);
    }

    static void MoveInto(string from, string to)
    {
        Directory.CreateDirectory(to);
        foreach (var file in Directory.GetFiles(from))
        {
            var dst = Path.Combine(to, Path.GetFileName(file));
            if (!File.Exists(dst) || File.GetLastWriteTimeUtc(file) > File.GetLastWriteTimeUtc(dst)) File.Copy(file, dst, true);
        }
        foreach (var dir in Directory.GetDirectories(from))
            MoveInto(dir, Path.Combine(to, Path.GetFileName(dir)));
    }

    static void CopyTree(string from, string to)
    {
        Directory.CreateDirectory(to);
        foreach (var file in Directory.GetFiles(from)) File.Copy(file, Path.Combine(to, Path.GetFileName(file)), true);
        foreach (var dir in Directory.GetDirectories(from)) CopyTree(dir, Path.Combine(to, Path.GetFileName(dir)));
    }

    static void LinkFolder(string id, string target)
    {
        var local = Local(id, target);
        var central = Central(target);
        Directory.CreateDirectory(central);
        if (IsLink(local)) return;
        if (Directory.Exists(local))
        {
            MoveInto(local, central);
            Directory.Delete(local, true);
        }
        Junction(local, central);
    }

    static void PullFile(string id, string target)
    {
        var local = Local(id, target);
        var central = Central(target);
        if (File.Exists(central))
        {
            Directory.CreateDirectory(Path.GetDirectoryName(local)!);
            File.Copy(central, local, true);
        }
        else if (File.Exists(local))
        {
            Directory.CreateDirectory(Path.GetDirectoryName(central)!);
            File.Copy(local, central, true);
        }
    }

    public static void BeforeLaunch(string id)
    {
        if (!Members().Contains(id)) return;
        foreach (var target in Targets())
        {
            try
            {
                if (target.EndsWith('/')) LinkFolder(id, target);
                else PullFile(id, target);
            }
            catch (Exception ex)
            {
                Hub.Log($"sync of {target} failed: {ex.Message}", "warn");
            }
        }
    }

    public static void AfterExit(string id)
    {
        if (!Members().Contains(id)) return;
        foreach (var target in Targets().Where(t => !t.EndsWith('/')))
        {
            var local = Local(id, target);
            if (!File.Exists(local)) continue;
            var central = Central(target);
            Directory.CreateDirectory(Path.GetDirectoryName(central)!);
            File.Copy(local, central, true);
        }
    }

    public static object Now()
    {
        var members = Members();
        var targets = Targets();
        foreach (var target in targets)
        {
            if (target.EndsWith('/'))
            {
                foreach (var id in members.Where(m => !Launch.IsRunning(m)))
                {
                    try
                    {
                        LinkFolder(id, target);
                    }
                    catch (Exception ex)
                    {
                        Hub.Log($"sync of {target} for {id} failed: {ex.Message}", "warn");
                    }
                }
                continue;
            }
            var central = Central(target);
            var candidates = members.Select(m => Local(m, target)).Append(central).Where(File.Exists).ToList();
            if (candidates.Count == 0) continue;
            var newest = candidates.OrderByDescending(File.GetLastWriteTimeUtc).First();
            Directory.CreateDirectory(Path.GetDirectoryName(central)!);
            if (!newest.Equals(central, StringComparison.OrdinalIgnoreCase)) File.Copy(newest, central, true);
            foreach (var id in members.Where(m => !Launch.IsRunning(m)))
            {
                var local = Local(id, target);
                Directory.CreateDirectory(Path.GetDirectoryName(local)!);
                File.Copy(central, local, true);
            }
        }
        Hub.Log($"synced {targets.Count} targets across {members.Count} instances");
        return new { targets = targets.Count, instances = members.Count };
    }

    public static void Detach(string id)
    {
        var game = Paths.Game(id);
        if (!Directory.Exists(game)) return;
        var stack = new Stack<string>();
        stack.Push(game);
        while (stack.Count > 0)
        {
            foreach (var dir in Directory.GetDirectories(stack.Pop()))
            {
                if (!IsLink(dir))
                {
                    stack.Push(dir);
                    continue;
                }
                var target = new DirectoryInfo(dir).LinkTarget;
                Directory.Delete(dir, false);
                if (target != null && Directory.Exists(target)) CopyTree(target, dir);
                else Directory.CreateDirectory(dir);
            }
        }
    }

    public static void RemoveLinks(string id)
    {
        var game = Paths.Game(id);
        if (!Directory.Exists(game)) return;
        var stack = new Stack<string>();
        stack.Push(game);
        while (stack.Count > 0)
        {
            foreach (var dir in Directory.GetDirectories(stack.Pop()))
            {
                if (IsLink(dir)) Directory.Delete(dir, false);
                else stack.Push(dir);
            }
        }
    }
}
