using System.Diagnostics;
using System.Text.Json.Nodes;
using Microsoft.Win32;

namespace Nelya.Core;

static class Bridge
{
    static string Str(JsonObject a, string key) => Js.S(a[key]) ?? throw new InvalidOperationException("missing " + key);

    public static async Task<object?> Call(string method, JsonObject a)
    {
        switch (method)
        {
            case "init":
                return new
                {
                    root = Paths.Root,
                    version = Hub.Version,
                    settings = Hub.Settings,
                    instances = Instances.List(),
                    accounts = Accounts.Public(),
                };
            case "update.state":
                return Updater.State();
            case "update.check":
                return await Updater.Check(true);
            case "update.download":
                return await Updater.Download();
            case "update.restart":
                Updater.Restart = true;
                return true;
            case "settings.save":
            {
                if (a["settings"] is JsonObject s)
                {
                    Hub.Settings = (JsonObject)s.DeepClone();
                    Store.Set("settings", Hub.Settings);
                    StartWithWindows(Js.B(s["startWithWindows"]) ?? false);
                }
                return true;
            }
            case "store.get":
                return Store.Get(Str(a, "key"));
            case "store.set":
                Store.Set(Str(a, "key"), a["value"]?.DeepClone());
                return true;
            case "versions.list":
                return await Meta.VersionList();
            case "loaders.list":
                return await Meta.LoaderVersions(Str(a, "loader"), Str(a, "mc"));
            case "instances.list":
                return Instances.List();
            case "instances.create":
            {
                var inst = Instances.Create(a["spec"] as JsonObject ?? new JsonObject());
                _ = Prepare(Js.S(inst["id"])!);
                return inst;
            }
            case "instances.update":
                return Instances.Update(Str(a, "id"), a["patch"] as JsonObject ?? new JsonObject());
            case "instances.delete":
                Instances.Delete(Str(a, "id"));
                return true;
            case "instances.duplicate":
                return Instances.Duplicate(Str(a, "id"));
            case "instances.size":
                return Instances.Size(Str(a, "id"));
            case "instances.prepare":
                _ = Prepare(Str(a, "id"));
                return true;
            case "open":
            {
                var path = Files.SafePath(Js.S(a["id"]) ?? "", Js.S(a["sub"]));
                if (Js.B(a["create"]) ?? true) Directory.CreateDirectory(path);
                Process.Start(new ProcessStartInfo("explorer.exe", "\"" + path + "\"") { UseShellExecute = true });
                return true;
            }
            case "game.launch":
                return Launch.Start(Str(a, "id"), a);
            case "game.kill":
                Launch.Kill(Js.S(a["session"]) is { Length: > 0 } session ? session : Str(a, "id"));
                return true;
            case "downloads.cancel":
                Downloads.Cancel(Str(a, "id"));
                return true;
            case "mods.plan":
                return await Mods.Plan(Str(a, "id"), Str(a, "versionId"));
            case "mods.install":
                return await Mods.Install(Str(a, "id"), a["items"] as JsonArray ?? new JsonArray(), Js.S(a["target"]) ?? Str(a, "id"));
            case "mods.list":
                return await Mods.List(Str(a, "id"));
            case "mods.toggle":
                Mods.Toggle(Str(a, "id"), Str(a, "file"), Js.B(a["enabled"]) ?? true);
                return true;
            case "mods.remove":
                Mods.Remove(Str(a, "id"), Str(a, "file"));
                return true;
            case "mods.updates":
                return await Mods.Updates(Str(a, "id"), Js.B(a["force"]) ?? false);
            case "files.worlds":
                return Files.Worlds(Str(a, "id"));
            case "files.screenshots":
                return Files.Screenshots(Str(a, "id"));
            case "files.log":
                return Files.Log(Str(a, "id"));
            case "files.share":
                return await Files.ShareLog(Str(a, "text"));
            case "accounts.device":
                return await Accounts.StartDevice();
            case "accounts.device.cancel":
                Accounts.CancelDevice();
                return true;
            case "open.link":
            {
                var url = Str(a, "url");
                if (!url.StartsWith("https://www.microsoft.com/link") && !url.StartsWith("https://microsoft.com/link")) throw new InvalidOperationException("not allowed");
                Process.Start(new ProcessStartInfo(url) { UseShellExecute = true });
                return true;
            }
            case "accounts.list":
                return Accounts.Public();
            case "accounts.remove":
                Accounts.Remove(Str(a, "id"));
                return Accounts.Public();
            case "accounts.skin":
            {
                var data = Str(a, "png");
                var comma = data.IndexOf(',');
                var bytes = Convert.FromBase64String(comma >= 0 ? data[(comma + 1)..] : data);
                return await Accounts.UploadSkin(Str(a, "id"), bytes, Js.B(a["slim"]) ?? false);
            }
            case "accounts.cape":
                return await Accounts.SetCape(Str(a, "id"), Js.S(a["cape"]));
            case "java.list":
                return Java.Detect();
            case "java.components":
                return await Java.Components();
            case "java.install":
                await Java.Ensure(Str(a, "component"), "runtimes");
                return Java.Detect();
            case "sync.now":
                return Sync.Now();
            case "sync.detach":
                Sync.Detach(Str(a, "id"));
                return true;
            case "cache.size":
                return Files.DirSize(Paths.Cache);
            case "cache.clear":
            {
                foreach (var dir in Directory.GetDirectories(Paths.Cache))
                {
                    if (Path.GetFileName(dir) is "skins" or "capes") continue;
                    try { Directory.Delete(dir, true); } catch { }
                }
                foreach (var file in Directory.GetFiles(Paths.Cache))
                {
                    try { File.Delete(file); } catch { }
                }
                return Files.DirSize(Paths.Cache);
            }
            case "import.scan":
                return Import.List();
            case "import.run":
                return await Import.Run(a["keys"] as JsonArray ?? new JsonArray(), Prepare);
            case "import.pick":
            {
                var file = await PickFile();
                if (file == null) return null;
                return await Import.FromFile(file, Prepare);
            }
            case "log.read":
            {
                var path = Path.Combine(Paths.Logs, "launcher.log");
                return File.Exists(path) ? string.Join('\n', File.ReadLines(path).TakeLast(200)) : "";
            }
            default:
                throw new InvalidOperationException("unknown call " + method);
        }
    }

    public static async Task Prepare(string id)
    {
        var inst = Instances.Get(id);
        if (inst == null) return;
        var name = Js.S(inst["name"]) ?? id;
        try
        {
            Hub.Emit("instance.state", new { id, state = "installing" });
            var versionId = await Instances.EnsureVersion(inst, CancellationToken.None);
            var r = await Meta.Resolve(versionId);
            var (assets, _, _) = await Meta.AssetJob(r, name, CancellationToken.None);
            await Task.WhenAll(
                Downloads.Run(await Meta.GameJob(r, name, CancellationToken.None), Math.Max(8, Hub.Threads)),
                Downloads.Run(assets, Math.Max(16, Hub.Threads * 2)),
                Java.Ensure(r.JavaComponent, name));
            Hub.Emit("instance.state", new { id, state = "ready" });
            Hub.Log($"{name} is installed and ready");
        }
        catch (Exception ex)
        {
            var message = ex is InvalidOperationException ? ex.Message : ex.Message;
            Hub.Emit("instance.state", new { id, state = "failed", error = message });
            Hub.Log($"installing {name} failed: {message}", "error");
        }
    }

    static Task<string?> PickFile()
    {
        var tcs = new TaskCompletionSource<string?>();
        var thread = new Thread(() =>
        {
            try
            {
                using var dlg = new OpenFileDialog
                {
                    Title = "import a modpack",
                    Filter = "modpacks (*.mrpack;*.zip)|*.mrpack;*.zip|all files (*.*)|*.*",
                    InitialDirectory = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), "Downloads"),
                };
                tcs.SetResult(dlg.ShowDialog() == DialogResult.OK ? dlg.FileName : null);
            }
            catch (Exception ex)
            {
                tcs.SetException(ex);
            }
        });
        thread.SetApartmentState(ApartmentState.STA);
        thread.Start();
        return tcs.Task;
    }

    static void StartWithWindows(bool on)
    {
        try
        {
            using var key = Registry.CurrentUser.OpenSubKey(@"Software\Microsoft\Windows\CurrentVersion\Run", true);
            if (key == null) return;
            if (on) key.SetValue("nelya", "\"" + Environment.ProcessPath + "\"");
            else if (key.GetValue("nelya") != null) key.DeleteValue("nelya");
        }
        catch
        {
        }
    }
}
