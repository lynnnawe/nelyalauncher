using System.IO.Compression;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;
using System.Xml.Linq;

namespace Nelya.Core;

sealed class Resolved
{
    public string Id = "";
    public string MainClass = "";
    public string Type = "release";
    public string JarId = "";
    public JsonObject? AssetIndex;
    public JsonObject? Client;
    public List<JsonObject> Libraries = new();
    public List<JsonNode> GameArgs = new();
    public List<JsonNode> JvmArgs = new();
    public string? LegacyArgs;
    public string JavaComponent = "jre-legacy";
    public int JavaMajor = 8;
}

sealed class Lib
{
    public string Path = "";
    public string? Url;
    public string? Sha1;
    public long Size;
    public bool Classpath = true;
    public bool Extract;
}

static class Rules
{
    public static bool Allow(JsonArray? rules, IReadOnlyDictionary<string, bool>? features = null)
    {
        if (rules == null || rules.Count == 0) return true;
        var allowed = false;
        foreach (var rule in rules.OfType<JsonObject>())
        {
            var matches = true;
            if (rule["os"] is JsonObject os)
            {
                var name = Js.S(os["name"]);
                if (name != null && name != "windows") matches = false;
                var arch = Js.S(os["arch"]);
                if (arch == "x86" && Environment.Is64BitOperatingSystem) matches = false;
                var version = Js.S(os["version"]);
                if (version != null && !Regex.IsMatch(Environment.OSVersion.Version.ToString(), version)) matches = false;
            }
            if (rule["features"] is JsonObject wanted)
            {
                foreach (var (key, value) in wanted)
                {
                    var have = features != null && features.TryGetValue(key, out var f) && f;
                    if (have != (Js.B(value) ?? false)) matches = false;
                }
            }
            if (matches) allowed = Js.S(rule["action"]) == "allow";
        }
        return allowed;
    }
}

static class Meta
{
    const string ManifestUrl = "https://piston-meta.mojang.com/mc/game/version_manifest_v2.json";

    public static Task<JsonNode> Manifest(bool fresh = false) =>
        Net.Cached(ManifestUrl, "version_manifest_v2.json", fresh ? TimeSpan.Zero : TimeSpan.FromMinutes(30));

    public static async Task<JsonArray> VersionList()
    {
        var manifest = await Manifest();
        var list = new JsonArray();
        foreach (var v in manifest["versions"]!.AsArray())
        {
            var type = Js.S(v?["type"]) ?? "release";
            list.Add(new JsonObject
            {
                ["id"] = Js.S(v?["id"]),
                ["type"] = type == "old_beta" || type == "old_alpha" ? "old" : type,
                ["date"] = (Js.S(v?["releaseTime"]) ?? "").Split('T')[0],
            });
        }
        return list;
    }

    public static async Task<JsonObject> VersionJson(string id, CancellationToken ct = default)
    {
        var path = Path.Combine(Paths.Versions, id, id + ".json");
        if (Js.Read(path) is JsonObject existing) return existing;
        var manifest = await Manifest();
        var entry = manifest["versions"]!.AsArray().FirstOrDefault(v => Js.S(v?["id"]) == id)
            ?? (await Manifest(true))["versions"]!.AsArray().FirstOrDefault(v => Js.S(v?["id"]) == id)
            ?? throw new InvalidOperationException("minecraft " + id + " was not found");
        var text = await Net.Http.GetStringAsync(Js.S(entry["url"]), ct);
        Directory.CreateDirectory(Path.GetDirectoryName(path)!);
        File.WriteAllText(path, text);
        return (JsonObject)JsonNode.Parse(text)!;
    }

    static string LibKey(JsonObject lib)
    {
        var name = Js.S(lib["name"]) ?? "";
        var at = name.IndexOf('@');
        if (at >= 0) name = name[..at];
        var p = name.Split(':');
        if (p.Length < 3) return name;
        return p.Length > 3 ? $"{p[0]}:{p[1]}:{p[3]}" : $"{p[0]}:{p[1]}";
    }

    public static async Task<Resolved> Resolve(string id, CancellationToken ct = default)
    {
        var node = await VersionJson(id, ct);
        var parentId = Js.S(node["inheritsFrom"]);
        var r = parentId != null ? await Resolve(parentId, ct) : new Resolved { JarId = id };
        r.Id = id;
        if (Js.S(node["mainClass"]) is string main) r.MainClass = main;
        if (Js.S(node["type"]) is string type) r.Type = type;
        if (node["assetIndex"] is JsonObject index) r.AssetIndex = index;
        if (node["downloads"]?["client"] is JsonObject client)
        {
            r.Client = client;
            r.JarId = id;
        }
        if (Js.S(node["jar"]) is string jar) r.JarId = jar;
        if (node["javaVersion"] is JsonObject java)
        {
            r.JavaComponent = Js.S(java["component"]) ?? r.JavaComponent;
            r.JavaMajor = (int)(Js.L(java["majorVersion"]) ?? r.JavaMajor);
        }
        if (node["libraries"] is JsonArray libs)
        {
            var mine = libs.OfType<JsonObject>().ToList();
            var keys = new HashSet<string>(mine.Select(LibKey));
            r.Libraries = mine.Concat(r.Libraries.Where(l => !keys.Contains(LibKey(l)))).ToList();
        }
        if (Js.S(node["minecraftArguments"]) is string legacy) r.LegacyArgs = legacy;
        if (node["arguments"] is JsonObject args)
        {
            if (args["game"] is JsonArray game) r.GameArgs.AddRange(game.Where(x => x != null).Select(x => x!.DeepClone()));
            if (args["jvm"] is JsonArray jvm) r.JvmArgs.AddRange(jvm.Where(x => x != null).Select(x => x!.DeepClone()));
        }
        return r;
    }

    public static string Maven(string coord)
    {
        var ext = "jar";
        var at = coord.IndexOf('@');
        if (at >= 0)
        {
            ext = coord[(at + 1)..];
            coord = coord[..at];
        }
        var p = coord.Split(':');
        var file = p[1] + "-" + p[2] + (p.Length > 3 ? "-" + p[3] : "") + "." + ext;
        return $"{p[0].Replace('.', '/')}/{p[1]}/{p[2]}/{file}";
    }

    static string LibPath(string rel) => Path.Combine(Paths.Libraries, rel.Replace('/', Path.DirectorySeparatorChar));

    public static List<Lib> Libraries(Resolved r)
    {
        var list = new List<Lib>();
        foreach (var lib in r.Libraries)
        {
            if (!Rules.Allow(lib["rules"] as JsonArray)) continue;
            var name = Js.S(lib["name"]);
            if (name == null) continue;
            var dl = lib["downloads"] as JsonObject;
            if (lib["natives"] is JsonObject natives)
            {
                var cls = Js.S(natives["windows"])?.Replace("${arch}", Environment.Is64BitOperatingSystem ? "64" : "32");
                if (cls != null && dl?["classifiers"]?[cls] is JsonObject c)
                {
                    list.Add(new Lib
                    {
                        Path = LibPath(Js.S(c["path"]) ?? Maven(name + ":" + cls)),
                        Url = Js.S(c["url"]),
                        Sha1 = Js.S(c["sha1"]),
                        Size = Js.L(c["size"]) ?? 0,
                        Classpath = false,
                        Extract = true,
                    });
                }
                if (dl?["artifact"] == null) continue;
            }
            if (dl?["artifact"] is JsonObject art)
            {
                var url = Js.S(art["url"]);
                list.Add(new Lib
                {
                    Path = LibPath(Js.S(art["path"]) ?? Maven(name)),
                    Url = string.IsNullOrEmpty(url) ? null : url,
                    Sha1 = Js.S(art["sha1"]),
                    Size = Js.L(art["size"]) ?? 0,
                    Extract = name.EndsWith(":natives-windows", StringComparison.Ordinal),
                });
            }
            else if (dl == null)
            {
                var rel = Maven(name);
                var local = LibPath(rel);
                if (lib["url"] == null && name.StartsWith("net.minecraftforge:forge:") && File.Exists(local))
                {
                    list.Add(new Lib { Path = local });
                    continue;
                }
                var baseUrl = Js.S(lib["url"])?.Replace("http://files.minecraftforge.net/maven/", "https://maven.minecraftforge.net/").Replace("http://", "https://") ?? "https://libraries.minecraft.net/";
                if (!baseUrl.EndsWith('/')) baseUrl += "/";
                list.Add(new Lib
                {
                    Path = LibPath(rel),
                    Url = baseUrl + rel,
                    Sha1 = Js.S(lib["sha1"]),
                    Size = Js.L(lib["size"]) ?? 0,
                });
            }
        }
        return list;
    }

    public static string ClientJar(Resolved r) => Path.Combine(Paths.Versions, r.JarId, r.JarId + ".jar");

    public static async Task<Job> GameJob(Resolved r, string target, CancellationToken ct)
    {
        var job = new Job { Name = "minecraft " + r.JarId, Target = target, Kind = "game" };
        if (r.Client != null)
        {
            job.Files.Add(new DlFile { Url = Js.S(r.Client["url"])!, Path = ClientJar(r), Sha1 = Js.S(r.Client["sha1"]), Size = Js.L(r.Client["size"]) ?? 0 });
        }
        else if (!File.Exists(ClientJar(r)))
        {
            var parent = await VersionJson(r.JarId, ct);
            if (parent["downloads"]?["client"] is JsonObject c)
                job.Files.Add(new DlFile { Url = Js.S(c["url"])!, Path = ClientJar(r), Sha1 = Js.S(c["sha1"]), Size = Js.L(c["size"]) ?? 0 });
        }
        foreach (var lib in Libraries(r))
            if (lib.Url != null) job.Files.Add(new DlFile { Url = lib.Url, Path = lib.Path, Sha1 = lib.Sha1, Size = lib.Size });
        return job;
    }

    public static async Task<(Job Job, string IndexId, JsonNode Index)> AssetJob(Resolved r, string target, CancellationToken ct)
    {
        var ai = r.AssetIndex ?? throw new InvalidOperationException("this version has no asset index");
        var id = Js.S(ai["id"])!;
        var indexPath = Path.Combine(Paths.Assets, "indexes", id + ".json");
        if (!File.Exists(indexPath))
        {
            var text = await Net.Http.GetStringAsync(Js.S(ai["url"]), ct);
            Directory.CreateDirectory(Path.GetDirectoryName(indexPath)!);
            File.WriteAllText(indexPath, text);
        }
        var index = Js.Read(indexPath) ?? throw new InvalidOperationException("asset index is broken");
        var job = new Job { Name = "assets " + id, Target = target, Kind = "game" };
        if (index["objects"] is JsonObject objects)
        {
            foreach (var (_, value) in objects)
            {
                var hash = Js.S(value?["hash"]);
                if (hash == null) continue;
                job.Files.Add(new DlFile
                {
                    Url = $"https://resources.download.minecraft.net/{hash[..2]}/{hash}",
                    Path = Path.Combine(Paths.Assets, "objects", hash[..2], hash),
                    Sha1 = hash,
                    Size = Js.L(value?["size"]) ?? 0,
                });
            }
        }
        return (job, id, index);
    }

    public static string AssetsRoot(string indexId, JsonNode index, string gameDir)
    {
        var isVirtual = Js.B(index["virtual"]) ?? false;
        var toResources = Js.B(index["map_to_resources"]) ?? false;
        if (!isVirtual && !toResources) return Paths.Assets;
        var target = toResources ? Path.Combine(gameDir, "resources") : Path.Combine(Paths.Assets, "virtual", indexId);
        if (index["objects"] is JsonObject objects)
        {
            foreach (var (name, value) in objects)
            {
                var hash = Js.S(value?["hash"]);
                if (hash == null) continue;
                var dst = Path.Combine(target, name.Replace('/', Path.DirectorySeparatorChar));
                if (File.Exists(dst)) continue;
                Directory.CreateDirectory(Path.GetDirectoryName(dst)!);
                File.Copy(Path.Combine(Paths.Assets, "objects", hash[..2], hash), dst, true);
            }
        }
        return toResources ? Paths.Assets : target;
    }

    public static void ExtractNatives(Resolved r, string dir)
    {
        var marker = Path.Combine(dir, ".nelya-" + r.Id);
        if (File.Exists(marker)) return;
        if (Directory.Exists(dir)) Directory.Delete(dir, true);
        Directory.CreateDirectory(dir);
        foreach (var lib in Libraries(r).Where(l => l.Extract && File.Exists(l.Path)))
        {
            using var zip = ZipFile.OpenRead(lib.Path);
            foreach (var entry in zip.Entries)
            {
                if (entry.FullName.StartsWith("META-INF", StringComparison.OrdinalIgnoreCase) || entry.FullName.EndsWith('/')) continue;
                if (!entry.Name.EndsWith(".dll", StringComparison.OrdinalIgnoreCase)) continue;
                var dst = Path.Combine(dir, entry.Name);
                entry.ExtractToFile(dst, true);
            }
        }
        File.WriteAllText(marker, "");
    }

    public static async Task<JsonArray> LoaderVersions(string loader, string mc)
    {
        var list = new JsonArray();
        switch (loader)
        {
            case "fabric":
            case "quilt":
            {
                var url = loader == "fabric"
                    ? $"https://meta.fabricmc.net/v2/versions/loader/{Uri.EscapeDataString(mc)}"
                    : $"https://meta.quiltmc.org/v3/versions/loader/{Uri.EscapeDataString(mc)}";
                JsonNode node;
                try
                {
                    node = await Net.Json(url);
                }
                catch (HttpRequestException)
                {
                    return list;
                }
                foreach (var item in node.AsArray())
                {
                    var v = Js.S(item?["loader"]?["version"]);
                    if (v == null) continue;
                    var stable = Js.B(item?["loader"]?["stable"]);
                    if (loader == "quilt" && v.Contains("beta")) stable = false;
                    list.Add(new JsonObject { ["id"] = v, ["stable"] = stable ?? true });
                }
                break;
            }
            case "forge":
            {
                var xml = await Net.Http.GetStringAsync("https://maven.minecraftforge.net/net/minecraftforge/forge/maven-metadata.xml");
                var all = XDocument.Parse(xml).Descendants("version").Select(x => x.Value).Where(v => v.StartsWith(mc + "-", StringComparison.Ordinal)).Reverse();
                foreach (var v in all) list.Add(new JsonObject { ["id"] = v, ["stable"] = true });
                break;
            }
            case "neoforge":
            {
                var xml = await Net.Http.GetStringAsync("https://maven.neoforged.net/releases/net/neoforged/neoforge/maven-metadata.xml");
                var prefix = mc.StartsWith("1.") ? mc[2..] : mc;
                if (!prefix.Contains('.')) prefix += ".0";
                prefix += ".";
                var all = XDocument.Parse(xml).Descendants("version").Select(x => x.Value).Where(v => v.StartsWith(prefix, StringComparison.Ordinal)).Reverse();
                foreach (var v in all) list.Add(new JsonObject { ["id"] = v, ["stable"] = !v.Contains("beta") });
                break;
            }
        }
        return list;
    }
}
