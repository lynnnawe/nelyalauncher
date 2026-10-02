using System.Diagnostics;
using System.IO.Compression;
using System.Text;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;
using Microsoft.VisualBasic.FileIO;

namespace Nelya.Core;

static class Instances
{
    static string JsonPath(string id) => Path.Combine(Paths.Instance(id), "instance.json");

    public static JsonObject? Get(string id) =>
        Regex.IsMatch(id, "^[a-z0-9._-]+$") ? Js.Read(JsonPath(id)) as JsonObject : null;

    public static JsonObject Need(string id) => Get(id) ?? throw new InvalidOperationException("that instance no longer exists");

    public static void Save(JsonObject inst) => Js.Write(JsonPath(Js.S(inst["id"])!), inst);

    static string Slug(string name)
    {
        var s = Regex.Replace(name.ToLowerInvariant(), "[^a-z0-9._-]+", "-").Trim('-', '.');
        if (s.Length == 0) s = "instance";
        if (s.Length > 40) s = s[..40];
        var id = s;
        for (var i = 2; Directory.Exists(Paths.Instance(id)); i++) id = s + "-" + i;
        return id;
    }

    static int CountFiles(string dir, params string[] patterns) =>
        Directory.Exists(dir) ? patterns.Sum(p => Directory.EnumerateFiles(dir, p).Count()) : 0;

    static int CountDirs(string dir) => Directory.Exists(dir) ? Directory.EnumerateDirectories(dir).Count() : 0;

    public static JsonObject WithStats(JsonObject inst)
    {
        var id = Js.S(inst["id"])!;
        var game = Paths.Game(id);
        var copy = (JsonObject)inst.DeepClone();
        copy["mods"] = CountFiles(Path.Combine(game, "mods"), "*.jar", "*.jar.disabled");
        copy["worlds"] = CountDirs(Path.Combine(game, "saves"));
        copy["running"] = Launch.IsRunning(id);
        return copy;
    }

    public static JsonArray List()
    {
        var list = new JsonArray();
        if (!Directory.Exists(Paths.Instances)) return list;
        foreach (var dir in Directory.GetDirectories(Paths.Instances))
        {
            if (Get(Path.GetFileName(dir)) is JsonObject inst) list.Add(WithStats(inst));
        }
        return list;
    }

    public static JsonObject Create(JsonObject spec)
    {
        var name = (Js.S(spec["name"]) ?? "").Trim();
        if (name.Length == 0) name = "new instance";
        var id = Slug(name);
        var rnd = Random.Shared;
        var inst = new JsonObject
        {
            ["id"] = id,
            ["name"] = name,
            ["version"] = Js.S(spec["version"]) ?? throw new InvalidOperationException("pick a game version"),
            ["loader"] = Js.S(spec["loader"]) ?? "vanilla",
            ["loaderVersion"] = Js.S(spec["loaderVersion"]),
            ["versionId"] = null,
            ["icon"] = Js.S(spec["icon"]) ?? "grass",
            ["created"] = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
            ["lastPlayed"] = 0,
            ["playtime"] = 0,
            ["lat"] = rnd.Next(-60, 61),
            ["lon"] = rnd.Next(-170, 171),
            ["settings"] = new JsonObject(),
        };
        var game = Paths.Game(id);
        foreach (var sub in new[] { "mods", "saves", "resourcepacks", "screenshots", "config" })
            Directory.CreateDirectory(Path.Combine(game, sub));
        Save(inst);
        Hub.Log($"created instance {name} ({inst["version"]} {inst["loader"]})");
        return WithStats(inst);
    }

    public static JsonObject Update(string id, JsonObject patch)
    {
        var inst = Need(id);
        var reinstall = false;
        foreach (var (key, value) in patch)
        {
            if (key is "id" or "created" or "versionId" or "playtime" or "lastPlayed") continue;
            if (key == "settings" && value is JsonObject s)
            {
                var current = inst["settings"] as JsonObject ?? new JsonObject();
                foreach (var (k, v) in s) current[k] = v?.DeepClone();
                inst["settings"] = current;
                continue;
            }
            if (key is "version" or "loader" or "loaderVersion" && Js.S(inst[key]) != Js.S(value)) reinstall = true;
            inst[key] = value?.DeepClone();
        }
        if (reinstall) inst["versionId"] = null;
        Save(inst);
        return WithStats(inst);
    }

    public static void Delete(string id)
    {
        var dir = Paths.Instance(id);
        if (!Directory.Exists(dir) || !Paths.Inside(dir, Paths.Instances)) return;
        Sync.RemoveLinks(id);
        FileSystem.DeleteDirectory(dir, UIOption.OnlyErrorDialogs, RecycleOption.SendToRecycleBin);
        Hub.Log("moved instance " + id + " to the recycle bin");
    }

    public static JsonObject Duplicate(string id)
    {
        var inst = Need(id);
        var name = Js.S(inst["name"]) + " copy";
        var newId = Slug(name);
        Copy(Paths.Instance(id), Paths.Instance(newId));
        var copy = (JsonObject)inst.DeepClone();
        copy["id"] = newId;
        copy["name"] = name;
        copy["created"] = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        copy["lastPlayed"] = 0;
        copy["playtime"] = 0;
        Save(copy);
        return WithStats(copy);
    }

    static void Copy(string from, string to)
    {
        Directory.CreateDirectory(to);
        foreach (var file in Directory.GetFiles(from))
            File.Copy(file, Path.Combine(to, Path.GetFileName(file)), true);
        foreach (var dir in Directory.GetDirectories(from))
        {
            if (new DirectoryInfo(dir).Attributes.HasFlag(FileAttributes.ReparsePoint)) continue;
            Copy(dir, Path.Combine(to, Path.GetFileName(dir)));
        }
    }

    public static long Size(string id)
    {
        long total = 0;
        var stack = new Stack<string>();
        stack.Push(Paths.Instance(id));
        while (stack.Count > 0)
        {
            var dir = stack.Pop();
            try
            {
                foreach (var f in Directory.EnumerateFiles(dir)) total += new FileInfo(f).Length;
                foreach (var d in Directory.EnumerateDirectories(dir))
                    if (!new DirectoryInfo(d).Attributes.HasFlag(FileAttributes.ReparsePoint)) stack.Push(d);
            }
            catch
            {
            }
        }
        return total;
    }

    public static async Task<string> EnsureVersion(JsonObject inst, CancellationToken ct)
    {
        var id = Js.S(inst["id"])!;
        var mc = Js.S(inst["version"])!;
        var loader = Js.S(inst["loader"]) ?? "vanilla";
        var lv = Js.S(inst["loaderVersion"]);
        var current = Js.S(inst["versionId"]);
        if (current != null && File.Exists(Path.Combine(Paths.Versions, current, current + ".json"))) return current;

        await Meta.VersionJson(mc, ct);
        string versionId;
        switch (loader)
        {
            case "vanilla":
                versionId = mc;
                break;
            case "fabric":
            case "quilt":
            {
                if (string.IsNullOrEmpty(lv))
                {
                    var list = await Meta.LoaderVersions(loader, mc);
                    lv = Js.S(list.FirstOrDefault(x => Js.B(x?["stable"]) ?? false)?["id"]) ?? Js.S(list.FirstOrDefault()?["id"])
                        ?? throw new InvalidOperationException($"{loader} does not support {mc} yet");
                    inst["loaderVersion"] = lv;
                }
                var url = loader == "fabric"
                    ? $"https://meta.fabricmc.net/v2/versions/loader/{mc}/{lv}/profile/json"
                    : $"https://meta.quiltmc.org/v3/versions/loader/{mc}/{lv}/profile/json";
                var text = await Net.Http.GetStringAsync(url, ct);
                var profile = JsonNode.Parse(text)!;
                versionId = Js.S(profile["id"])!;
                var path = Path.Combine(Paths.Versions, versionId, versionId + ".json");
                Directory.CreateDirectory(Path.GetDirectoryName(path)!);
                File.WriteAllText(path, text);
                break;
            }
            case "forge":
            case "neoforge":
                versionId = await RunInstaller(loader, mc, lv, Js.S(inst["name"]) ?? id, ct);
                break;
            default:
                throw new InvalidOperationException("unknown mod loader " + loader);
        }
        inst["versionId"] = versionId;
        Save(inst);
        return versionId;
    }

    static async Task<string> RunInstaller(string loader, string mc, string? lv, string target, CancellationToken ct)
    {
        if (string.IsNullOrEmpty(lv))
        {
            var list = await Meta.LoaderVersions(loader, mc);
            lv = Js.S(list.FirstOrDefault()?["id"]) ?? throw new InvalidOperationException($"{loader} does not support {mc}");
        }
        var file = loader == "forge" ? $"forge-{lv}-installer.jar" : $"neoforge-{lv}-installer.jar";
        var url = loader == "forge"
            ? $"https://maven.minecraftforge.net/net/minecraftforge/forge/{lv}/{file}"
            : $"https://maven.neoforged.net/releases/net/neoforged/neoforge/{lv}/{file}";
        var dir = Path.Combine(Paths.Cache, "installers");
        var jar = Path.Combine(dir, file);
        var job = new Job { Name = $"{loader} {lv} installer", Target = target, Kind = "loader" };
        job.Files.Add(new DlFile { Url = url, Path = jar });
        await Downloads.Run(job, 1, ct);

        string? versionId;
        using (var zip = ZipFile.OpenRead(jar))
        {
            var entry = zip.GetEntry("install_profile.json") ?? throw new InvalidOperationException("that installer looks broken");
            using var reader = new StreamReader(entry.Open());
            var profile = JsonNode.Parse(await reader.ReadToEndAsync(ct))!;
            versionId = Js.S(profile["version"]) ?? Js.S(profile["versionInfo"]?["id"]);
            if (versionId == null) throw new InvalidOperationException("could not read the installer profile");
            if (profile["versionInfo"] is JsonObject legacy && profile["install"] is JsonObject install)
            {
                var vjson = Path.Combine(Paths.Versions, versionId, versionId + ".json");
                var info = (JsonObject)legacy.DeepClone();
                if (info["libraries"] is JsonArray libs)
                {
                    var keep = new JsonArray();
                    foreach (var lib in libs.OfType<JsonObject>().ToList())
                    {
                        var libUrl = Js.S(lib["url"]);
                        if (libUrl != null) lib["url"] = libUrl.Replace("http://files.minecraftforge.net/maven/", "https://maven.minecraftforge.net/").Replace("http://", "https://");
                        lib.Remove("checksums");
                        lib.Remove("clientreq");
                        lib.Remove("serverreq");
                        keep.Add(lib.DeepClone());
                    }
                    info["libraries"] = keep;
                }
                var coord = Js.S(install["path"]);
                var inner = Js.S(install["filePath"]);
                if (coord != null && inner != null && zip.GetEntry(inner) is ZipArchiveEntry universal)
                {
                    var dst = Path.Combine(Paths.Libraries, Meta.Maven(coord).Replace('/', Path.DirectorySeparatorChar));
                    Directory.CreateDirectory(Path.GetDirectoryName(dst)!);
                    universal.ExtractToFile(dst, true);
                    if (info["libraries"] is JsonArray l2)
                        foreach (var lib in l2.OfType<JsonObject>().Where(x => Js.S(x["name"]) == coord)) lib.Remove("url");
                }
                Directory.CreateDirectory(Path.GetDirectoryName(vjson)!);
                File.WriteAllText(vjson, info.ToJsonString(Js.Pretty));
                Hub.Log($"installed legacy {loader} {lv}");
                return versionId;
            }
        }
        if (File.Exists(Path.Combine(Paths.Versions, versionId, versionId + ".json"))) return versionId;

        var vanilla = await Meta.Resolve(mc, ct);
        await Downloads.Run(await Meta.GameJob(vanilla, target, ct), 16, ct);
        var java = await Java.Ensure(vanilla.JavaComponent, target, ct);
        Hub.Log($"running {loader} {lv} installer");
        Hub.Emit("game.state", new { id = target, state = "installing", step = $"running the {loader} installer" });

        foreach (var flag in new[] { "--installClient", "--install-client" })
        {
            var psi = new ProcessStartInfo(java)
            {
                WorkingDirectory = dir,
                UseShellExecute = false,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                CreateNoWindow = true,
            };
            psi.ArgumentList.Add("-jar");
            psi.ArgumentList.Add(jar);
            psi.ArgumentList.Add(flag);
            psi.ArgumentList.Add(Paths.Root);
            using var p = Process.Start(psi)!;
            var output = new StringBuilder();
            p.OutputDataReceived += (_, e) => { if (e.Data != null) { output.AppendLine(e.Data); Hub.Emit("log", new { text = e.Data, lvl = "info" }); } };
            p.ErrorDataReceived += (_, e) => { if (e.Data != null) output.AppendLine(e.Data); };
            p.BeginOutputReadLine();
            p.BeginErrorReadLine();
            await p.WaitForExitAsync(ct);
            if (p.ExitCode == 0 && File.Exists(Path.Combine(Paths.Versions, versionId, versionId + ".json"))) return versionId;
            if (!output.ToString().Contains("not a recognized option", StringComparison.OrdinalIgnoreCase)) break;
        }
        throw new InvalidOperationException($"the {loader} installer failed, check the console");
    }
}
