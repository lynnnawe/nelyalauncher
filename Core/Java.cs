using System.Text.Json.Nodes;

namespace Nelya.Core;

static class Java
{
    const string AllUrl = "https://launchermeta.mojang.com/v1/products/java-runtime/2ec0cc96c44e5a76b9c8b7c39df7210883d12871/all.json";

    static readonly SemaphoreSlim Gate = new(1, 1);

    public static string Exe(string component) => Path.Combine(Paths.Runtime, component, "bin", "java.exe");

    static string Marker(string component) => Path.Combine(Paths.Runtime, component, ".nelya-ok");

    public static bool Installed(string component) => File.Exists(Marker(component)) && File.Exists(Exe(component));

    static Task<JsonNode> All() => Net.Cached(AllUrl, "java-runtimes.json", TimeSpan.FromDays(1));

    public static async Task<string> Ensure(string component, string target, CancellationToken ct = default)
    {
        if (Installed(component)) return Exe(component);
        await Gate.WaitAsync(ct);
        try
        {
            if (Installed(component)) return Exe(component);
            var all = await All();
            var entry = (all["windows-x64"]?[component] as JsonArray)?.FirstOrDefault()
                ?? throw new InvalidOperationException("mojang has no " + component + " java for windows");
            var name = Js.S(entry["version"]?["name"]) ?? component;
            var manifest = await Net.Json(Js.S(entry["manifest"]?["url"])!, ct);
            var root = Path.Combine(Paths.Runtime, component);
            var job = new Job { Name = "java " + name, Target = target, Kind = "java" };
            foreach (var (path, value) in manifest["files"]!.AsObject())
            {
                if (Js.S(value?["type"]) != "file") continue;
                var raw = value?["downloads"]?["raw"];
                if (raw == null) continue;
                job.Files.Add(new DlFile
                {
                    Url = Js.S(raw["url"])!,
                    Path = Path.Combine(root, path.Replace('/', Path.DirectorySeparatorChar)),
                    Sha1 = Js.S(raw["sha1"]),
                    Size = Js.L(raw["size"]) ?? 0,
                });
            }
            Hub.Log($"installing java {name} ({component})");
            await Downloads.Run(job, 12, ct);
            File.WriteAllText(Marker(component), name);
            return Exe(component);
        }
        finally
        {
            Gate.Release();
        }
    }

    public static async Task<JsonArray> Components()
    {
        var list = new JsonArray();
        try
        {
            var all = await All();
            if (all["windows-x64"] is JsonObject win)
            {
                foreach (var (component, value) in win)
                {
                    var entry = (value as JsonArray)?.FirstOrDefault();
                    if (entry == null) continue;
                    list.Add(new JsonObject
                    {
                        ["id"] = component,
                        ["name"] = Js.S(entry["version"]?["name"]),
                        ["installed"] = Installed(component),
                    });
                }
            }
        }
        catch
        {
        }
        return list;
    }

    static (string Version, string Vendor) ReadRelease(string home)
    {
        var release = Path.Combine(home, "release");
        string version = "", vendor = "";
        if (File.Exists(release))
        {
            foreach (var line in File.ReadAllLines(release))
            {
                if (line.StartsWith("JAVA_VERSION=")) version = line[13..].Trim('"');
                if (line.StartsWith("IMPLEMENTOR=")) vendor = line[12..].Trim('"');
            }
        }
        return (version, vendor);
    }

    static string Short(string vendor) => vendor.ToLowerInvariant() switch
    {
        var v when v.Contains("adoptium") || v.Contains("temurin") => "temurin",
        var v when v.Contains("azul") => "zulu",
        var v when v.Contains("microsoft") => "microsoft",
        var v when v.Contains("amazon") => "corretto",
        var v when v.Contains("bellsoft") => "liberica",
        var v when v.Contains("oracle") => "oracle",
        "" => "java",
        var v => v.Split(' ')[0],
    };

    public static JsonArray Detect()
    {
        var list = new JsonArray();
        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        void Add(string home, bool managed, string? label = null)
        {
            var exe = Path.Combine(home, "bin", "java.exe");
            if (!File.Exists(exe) || !seen.Add(Path.GetFullPath(exe))) return;
            var (version, vendor) = ReadRelease(home);
            list.Add(new JsonObject
            {
                ["id"] = exe,
                ["name"] = label ?? $"{Short(vendor)} {version}".Trim(),
                ["path"] = home,
                ["version"] = version,
                ["managed"] = managed,
            });
        }
        if (Directory.Exists(Paths.Runtime))
            foreach (var dir in Directory.GetDirectories(Paths.Runtime))
                if (File.Exists(Path.Combine(dir, ".nelya-ok")))
                    Add(dir, true, File.ReadAllText(Path.Combine(dir, ".nelya-ok")).Trim() + " (" + Path.GetFileName(dir) + ")");
        var roots = new[]
        {
            Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles),
            Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86),
        };
        var vendors = new[] { "Java", "Eclipse Adoptium", "Zulu", "Microsoft", "Amazon Corretto", "BellSoft", "Semeru", "AdoptOpenJDK" };
        foreach (var root in roots.Where(Directory.Exists))
            foreach (var vendor in vendors)
            {
                var dir = Path.Combine(root, vendor);
                if (!Directory.Exists(dir)) continue;
                foreach (var home in Directory.GetDirectories(dir)) Add(home, false);
            }
        var envHome = Environment.GetEnvironmentVariable("JAVA_HOME");
        if (!string.IsNullOrEmpty(envHome) && Directory.Exists(envHome)) Add(envHome, false);
        return list;
    }
}
