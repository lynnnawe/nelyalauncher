using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.IO.Compression;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;
using Microsoft.Data.Sqlite;

namespace Nelya.Core;

sealed class Candidate
{
    public required string Key;
    public required string Source;
    public required string Name;
    public string Version = "";
    public string Loader = "vanilla";
    public string? LoaderVersion;
    public string? GameDir;
    public string? ModsDir;
    public string? IconPath;
    public long LastPlayed;
    public long Playtime;
    public string? Note;
    public string? Pack;
}

static class Import
{
    static readonly string AppData = Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData);
    static readonly string Home = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);

    static readonly HashSet<string> Skip = new(StringComparer.OrdinalIgnoreCase)
    {
        "logs", "crash-reports", "natives", ".fabric", "debug", "jfr", ".mixin.out", ".cache", "downloads", "game-versions", "essential", ".replay_cache",
    };

    static string? ReadText(string path)
    {
        try
        {
            return File.Exists(path) ? File.ReadAllText(path) : null;
        }
        catch
        {
            return null;
        }
    }

    static string NormLoader(string? s) => (s ?? "").ToLowerInvariant() switch
    {
        var x when x.Contains("neoforge") => "neoforge",
        var x when x.Contains("forge") => "forge",
        var x when x.Contains("quilt") => "quilt",
        var x when x.Contains("fabric") => "fabric",
        _ => "vanilla",
    };

    static int Count(string? dir, string pattern) =>
        dir != null && Directory.Exists(dir) ? Directory.EnumerateFiles(dir, pattern).Count() : 0;

    static int Worlds(string? game) =>
        game != null && Directory.Exists(Path.Combine(game, "saves")) ? Directory.EnumerateDirectories(Path.Combine(game, "saves")).Count() : 0;

    public static List<Candidate> Scan()
    {
        var all = new List<Candidate>();
        foreach (var scan in new Func<IEnumerable<Candidate>>[] { Prism, Pandora, Modrinth, CurseForge, Lunar })
        {
            try
            {
                all.AddRange(scan());
            }
            catch (Exception ex)
            {
                Hub.Log("import scan failed: " + ex.Message, "warn");
            }
        }
        return all;
    }

    static IEnumerable<Candidate> Prism()
    {
        var root = Path.Combine(AppData, "PrismLauncher");
        var dir = Path.Combine(root, "instances");
        if (!Directory.Exists(dir)) yield break;
        foreach (var inst in Directory.GetDirectories(dir))
        {
            var cfg = ReadText(Path.Combine(inst, "instance.cfg"));
            var pack = Js.Read(Path.Combine(inst, "mmc-pack.json"));
            if (cfg == null || pack?["components"] is not JsonArray comps) continue;
            string Cfg(string key) => Regex.Match(cfg, "^" + key + "=(.*)$", RegexOptions.Multiline).Groups[1].Value.Trim();
            var c = new Candidate { Key = "prism:" + inst, Source = "prism", Name = Cfg("name") is { Length: > 0 } n ? n : Path.GetFileName(inst) };
            foreach (var comp in comps.OfType<JsonObject>())
            {
                var uid = Js.S(comp["uid"]);
                var ver = Js.S(comp["version"]);
                switch (uid)
                {
                    case "net.minecraft": c.Version = ver ?? ""; break;
                    case "net.fabricmc.fabric-loader": c.Loader = "fabric"; c.LoaderVersion = ver; break;
                    case "org.quiltmc.quilt-loader": c.Loader = "quilt"; c.LoaderVersion = ver; break;
                    case "net.minecraftforge": c.Loader = "forge"; c.LoaderVersion = ver; break;
                    case "net.neoforged": c.Loader = "neoforge"; c.LoaderVersion = ver; break;
                }
            }
            if (c.Loader == "forge" && c.LoaderVersion != null && !c.LoaderVersion.StartsWith(c.Version + "-")) c.LoaderVersion = c.Version + "-" + c.LoaderVersion;
            c.GameDir = new[] { "minecraft", ".minecraft" }.Select(x => Path.Combine(inst, x)).FirstOrDefault(Directory.Exists);
            var icon = Cfg("iconKey");
            if (icon.Length > 0 && icon != "default")
            {
                var file = Directory.Exists(Path.Combine(root, "icons")) ? Directory.EnumerateFiles(Path.Combine(root, "icons"), icon + ".*").FirstOrDefault() : null;
                c.IconPath = file;
            }
            long.TryParse(Cfg("lastLaunchTime"), out c.LastPlayed);
            long.TryParse(Cfg("totalTimePlayed"), out c.Playtime);
            if (c.Version.Length > 0) yield return c;
        }
    }

    static IEnumerable<Candidate> Pandora()
    {
        var dir = Path.Combine(AppData, "PandoraLauncher", "instances");
        if (!Directory.Exists(dir)) yield break;
        foreach (var inst in Directory.GetDirectories(dir))
        {
            var info = Js.Read(Path.Combine(inst, "info_v1.json"));
            if (info == null) continue;
            var stats = Js.Read(Path.Combine(inst, "stats_v1.json"));
            var c = new Candidate
            {
                Key = "pandora:" + inst,
                Source = "pandora",
                Name = Path.GetFileName(inst),
                Version = Js.S(info["minecraft_version"]) ?? "",
                Loader = NormLoader(Js.S(info["loader"])),
                LoaderVersion = Js.S(info["loader_version"]),
                GameDir = Path.Combine(inst, ".minecraft"),
                LastPlayed = Js.L(stats?["last_played_unix_ms"]) ?? 0,
                Playtime = Js.L(stats?["total_playtime_secs"]) ?? 0,
            };
            var custom = Path.Combine(inst, ".minecraft", "icon.png");
            if (File.Exists(custom)) c.IconPath = custom;
            else if (Js.S(info["instance_fallback_icon"]) is string fallback) c.IconPath = Lucide(Path.GetFileNameWithoutExtension(fallback));
            if (c.Loader != "vanilla" && c.LoaderVersion == null) c.Note = "newest " + c.Loader + " will be used";
            if (c.Version.Length > 0) yield return c;
        }
    }

    static IEnumerable<Candidate> Modrinth()
    {
        var list = new List<Candidate>();
        foreach (var root in new[] { Path.Combine(AppData, "ModrinthApp"), Path.Combine(AppData, "com.modrinth.theseus") })
        {
            var profiles = Path.Combine(root, "profiles");
            if (!Directory.Exists(profiles)) continue;
            var db = Path.Combine(root, "app.db");
            var fromDb = new Dictionary<string, Candidate>(StringComparer.OrdinalIgnoreCase);
            if (File.Exists(db))
            {
                try
                {
                    using var conn = new SqliteConnection(new SqliteConnectionStringBuilder { DataSource = db, Mode = SqliteOpenMode.ReadOnly }.ToString());
                    conn.Open();
                    using var cmd = conn.CreateCommand();
                    cmd.CommandText = "SELECT * FROM profiles";
                    using var r = cmd.ExecuteReader();
                    var cols = Enumerable.Range(0, r.FieldCount).ToDictionary(i => r.GetName(i), i => i, StringComparer.OrdinalIgnoreCase);
                    string? Col(string name) => cols.TryGetValue(name, out var i) && !r.IsDBNull(i) ? Convert.ToString(r.GetValue(i)) : null;
                    while (r.Read())
                    {
                        var path = Col("path");
                        if (path == null) continue;
                        var c = new Candidate
                        {
                            Key = "modrinth:" + Path.Combine(profiles, path),
                            Source = "modrinth",
                            Name = Col("name") ?? path,
                            Version = Col("game_version") ?? "",
                            Loader = NormLoader(Col("mod_loader")),
                            LoaderVersion = Col("mod_loader_version"),
                            GameDir = Path.Combine(profiles, path),
                            IconPath = Col("icon_path"),
                        };
                        if (long.TryParse(Col("last_played"), out var lp)) c.LastPlayed = lp < 100_000_000_000 ? lp * 1000 : lp;
                        if (long.TryParse(Col("submitted_time_played"), out var a) | long.TryParse(Col("recent_time_played"), out var b)) c.Playtime = a + b;
                        fromDb[path] = c;
                    }
                }
                catch (Exception ex)
                {
                    Hub.Log("could not read the modrinth app database: " + ex.Message, "warn");
                }
            }
            foreach (var dir in Directory.GetDirectories(profiles))
            {
                var name = Path.GetFileName(dir);
                if (fromDb.TryGetValue(name, out var known))
                {
                    list.Add(known);
                    continue;
                }
                var json = Js.Read(Path.Combine(dir, "profile.json"));
                var meta = json?["metadata"];
                if (meta == null) continue;
                list.Add(new Candidate
                {
                    Key = "modrinth:" + dir,
                    Source = "modrinth",
                    Name = Js.S(meta["name"]) ?? name,
                    Version = Js.S(meta["game_version"]) ?? "",
                    Loader = NormLoader(Js.S(meta["loader"])),
                    LoaderVersion = Js.S(meta["loader_version"]?["id"]) ?? Js.S(meta["loader_version"]),
                    GameDir = dir,
                    IconPath = Js.S(meta["icon"]),
                });
            }
        }
        return list.Where(c => c.Version.Length > 0);
    }

    static IEnumerable<Candidate> CurseForge()
    {
        var roots = new List<string> { Path.Combine(Home, "curseforge", "minecraft", "Instances") };
        var settings = Js.Read(Path.Combine(Home, "curseforge", "minecraft", "Install", "settings.json"));
        if (Js.S(settings?["instancesPath"]) is string custom) roots.Insert(0, custom);
        foreach (var dir in roots.Distinct(StringComparer.OrdinalIgnoreCase).Where(Directory.Exists))
        {
            foreach (var inst in Directory.GetDirectories(dir))
            {
                var json = Js.Read(Path.Combine(inst, "minecraftinstance.json"));
                if (json == null) continue;
                var baseLoader = json["baseModLoader"];
                var loaderName = Js.S(baseLoader?["name"]);
                var c = new Candidate
                {
                    Key = "curseforge:" + inst,
                    Source = "curseforge",
                    Name = Js.S(json["name"]) ?? Path.GetFileName(inst),
                    Version = Js.S(json["gameVersion"]) ?? Js.S(baseLoader?["minecraftVersion"]) ?? "",
                    Loader = NormLoader(loaderName),
                    GameDir = inst,
                };
                if (loaderName != null)
                {
                    var v = loaderName[(loaderName.IndexOf('-') + 1)..];
                    if (c.Loader == "fabric" || c.Loader == "quilt") v = v.Split('-')[0];
                    if (c.Loader == "forge" && !v.StartsWith(c.Version + "-")) v = c.Version + "-" + v;
                    c.LoaderVersion = v;
                }
                if (DateTimeOffset.TryParse(Js.S(json["lastPlayed"]), out var lp) && lp.Year > 2000) c.LastPlayed = lp.ToUnixTimeMilliseconds();
                var img = Path.Combine(inst, "profileImage");
                if (Directory.Exists(img)) c.IconPath = Directory.EnumerateFiles(img).FirstOrDefault();
                if (c.Version.Length > 0) yield return c;
            }
        }
    }

    static IEnumerable<Candidate> Lunar()
    {
        var dir = Path.Combine(Home, ".lunarclient", "profiles");
        if (!Directory.Exists(dir)) yield break;
        foreach (var prof in Directory.GetDirectories(dir))
        {
            var name = Path.GetFileName(prof);
            var versions = Path.Combine(prof, "game-versions");
            if (Directory.Exists(versions))
            {
                var ver = Directory.GetDirectories(versions).Select(Path.GetFileName).FirstOrDefault();
                if (ver == null) continue;
                var mods = Path.Combine(prof, "mods");
                var loader = Count(mods, "*.jar") > 0 ? "fabric" : "vanilla";
                yield return new Candidate
                {
                    Key = "lunar:" + prof,
                    Source = "lunar",
                    Name = name.Replace('-', ' '),
                    Version = ver,
                    Loader = loader,
                    GameDir = prof,
                    LastPlayed = new DateTimeOffset(Directory.GetLastWriteTimeUtc(prof)).ToUnixTimeMilliseconds(),
                    Note = "lunar's own client is not included, only your mods and files",
                };
                continue;
            }
            var modsRoot = Path.Combine(prof, "mods");
            if (!Directory.Exists(modsRoot)) continue;
            foreach (var sub in Directory.GetDirectories(modsRoot))
            {
                var m = Regex.Match(Path.GetFileName(sub), "^(fabric|forge|neoforge|quilt)-(.+)$");
                if (!m.Success || Count(sub, "*.jar") == 0) continue;
                yield return new Candidate
                {
                    Key = "lunar:" + sub,
                    Source = "lunar",
                    Name = "lunar " + m.Groups[2].Value,
                    Version = m.Groups[2].Value,
                    Loader = NormLoader(m.Groups[1].Value),
                    ModsDir = sub,
                    LastPlayed = new DateTimeOffset(Directory.GetLastWriteTimeUtc(sub)).ToUnixTimeMilliseconds(),
                    Note = "only the mods you added, your worlds stay in lunar",
                };
            }
        }
    }

    static HashSet<string> Imported()
    {
        var set = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var inst in Instances.List().OfType<JsonObject>())
            if (Js.S(inst["importedFrom"]) is string k) set.Add(k);
        return set;
    }

    public static JsonArray List()
    {
        var imported = Imported();
        var list = new JsonArray();
        foreach (var c in Scan())
        {
            var mods = c.ModsDir ?? (c.GameDir != null ? Path.Combine(c.GameDir, "mods") : null);
            list.Add(new JsonObject
            {
                ["key"] = c.Key,
                ["source"] = c.Source,
                ["name"] = c.Name,
                ["version"] = c.Version,
                ["loader"] = c.Loader,
                ["loaderVersion"] = c.LoaderVersion,
                ["mods"] = Count(mods, "*.jar"),
                ["worlds"] = Worlds(c.GameDir),
                ["lastPlayed"] = c.LastPlayed,
                ["playtime"] = c.Playtime,
                ["icon"] = IconData(c.IconPath),
                ["note"] = c.Note,
                ["path"] = c.GameDir ?? c.ModsDir,
                ["imported"] = imported.Contains(c.Key),
            });
        }
        return list;
    }

    static string? Lucide(string name)
    {
        if (!Regex.IsMatch(name, "^[a-z0-9-]+$")) return null;
        var file = Path.Combine(Paths.Cache, "icons", "lucide-" + name + ".svg");
        if (File.Exists(file)) return file;
        for (var attempt = 0; attempt < 3; attempt++)
        {
            try
            {
                var svg = Net.Http.GetStringAsync("https://unpkg.com/lucide-static@latest/icons/" + name + ".svg").GetAwaiter().GetResult();
                if (!svg.Contains("<svg")) return null;
                Directory.CreateDirectory(Path.GetDirectoryName(file)!);
                File.WriteAllText(file, svg);
                return file;
            }
            catch
            {
                Thread.Sleep(400);
            }
        }
        return null;
    }

    static string? IconData(string? path)
    {
        if (path == null || !File.Exists(path)) return null;
        if (path.EndsWith(".svg", StringComparison.OrdinalIgnoreCase))
        {
            var svg = File.ReadAllText(path).Replace("currentColor", "#e6e3f0");
            svg = Regex.Replace(svg, "<!--.*?-->", "", RegexOptions.Singleline);
            svg = Regex.Replace(svg, "width=\"24\"", "width=\"96\"");
            svg = Regex.Replace(svg, "height=\"24\"", "height=\"96\"");
            return "data:image/svg+xml;base64," + Convert.ToBase64String(System.Text.Encoding.UTF8.GetBytes(svg));
        }
        try
        {
            using var src = Image.FromFile(path);
            const int size = 96;
            using var bmp = new Bitmap(size, size, PixelFormat.Format32bppArgb);
            using (var g = Graphics.FromImage(bmp))
            {
                var pixel = src.Width <= 32;
                g.InterpolationMode = pixel ? InterpolationMode.NearestNeighbor : InterpolationMode.HighQualityBicubic;
                g.PixelOffsetMode = PixelOffsetMode.Half;
                var k = Math.Max((double)size / src.Width, (double)size / src.Height);
                var w = (int)(src.Width * k);
                var h = (int)(src.Height * k);
                g.DrawImage(src, (size - w) / 2, (size - h) / 2, w, h);
            }
            using var ms = new MemoryStream();
            bmp.Save(ms, ImageFormat.Png);
            return "data:image/png;base64," + Convert.ToBase64String(ms.ToArray());
        }
        catch
        {
            return null;
        }
    }

    static void CopyTree(string from, string to, string key, ref long done, long total, HashSet<string> seen, int depth = 0)
    {
        var real = new DirectoryInfo(from).LinkTarget is string target ? Path.GetFullPath(Path.Combine(Path.GetDirectoryName(from)!, target)) : from;
        if (!Directory.Exists(real) || !seen.Add(Path.GetFullPath(real)) || depth > 40) return;
        Directory.CreateDirectory(to);
        foreach (var file in Directory.EnumerateFiles(real))
        {
            try
            {
                File.Copy(file, Path.Combine(to, Path.GetFileName(file)), true);
            }
            catch
            {
            }
            done++;
            if (done % 25 == 0) Hub.Emit("import.progress", new { key, done, total });
        }
        foreach (var dir in Directory.EnumerateDirectories(real))
        {
            if (depth == 0 && Skip.Contains(Path.GetFileName(dir))) continue;
            CopyTree(dir, Path.Combine(to, Path.GetFileName(dir)), key, ref done, total, seen, depth + 1);
        }
    }

    static long CountFiles(string dir, int depth = 0)
    {
        try
        {
            var real = new DirectoryInfo(dir).LinkTarget is string t ? Path.GetFullPath(Path.Combine(Path.GetDirectoryName(dir)!, t)) : dir;
            if (!Directory.Exists(real) || depth > 40) return 0;
            long n = Directory.EnumerateFiles(real).LongCount();
            foreach (var d in Directory.EnumerateDirectories(real))
                if (!(depth == 0 && Skip.Contains(Path.GetFileName(d)))) n += CountFiles(d, depth + 1);
            return n;
        }
        catch
        {
            return 0;
        }
    }

    public static async Task<JsonArray> Run(JsonArray keys, Func<string, Task> prepare)
    {
        var wanted = new HashSet<string>(keys.Select(Js.S).Where(k => k != null)!, StringComparer.OrdinalIgnoreCase);
        var found = Scan().Where(c => wanted.Contains(c.Key)).ToList();
        var made = new JsonArray();
        foreach (var c in found)
        {
            Hub.Emit("import.progress", new { key = c.Key, done = 0, total = 1, state = "copying" });
            try
            {
                var inst = Instances.Create(new JsonObject
                {
                    ["name"] = c.Name,
                    ["version"] = c.Version,
                    ["loader"] = c.Loader,
                    ["loaderVersion"] = c.LoaderVersion,
                    ["icon"] = IconData(c.IconPath) ?? DefaultIcon(c.Loader),
                });
                var id = Js.S(inst["id"])!;
                var game = Paths.Game(id);
                await Task.Run(() =>
                {
                    long done = 0;
                    if (c.GameDir != null)
                    {
                        var total = Math.Max(1, CountFiles(c.GameDir));
                        CopyTree(c.GameDir, game, c.Key, ref done, total, new HashSet<string>(StringComparer.OrdinalIgnoreCase));
                    }
                    if (c.ModsDir != null)
                    {
                        var mods = Path.Combine(game, "mods");
                        Directory.CreateDirectory(mods);
                        foreach (var jar in Directory.EnumerateFiles(c.ModsDir, "*.jar")) File.Copy(jar, Path.Combine(mods, Path.GetFileName(jar)), true);
                    }
                });
                var saved = Instances.Need(id);
                saved["importedFrom"] = c.Key;
                saved["playtime"] = c.Playtime;
                saved["lastPlayed"] = c.LastPlayed;
                Instances.Save(saved);
                Hub.Log($"imported {c.Name} from {c.Source}");
                Hub.Emit("import.progress", new { key = c.Key, done = 1, total = 1, state = "done", id });
                made.Add(Instances.WithStats(saved));
                _ = prepare(id);
            }
            catch (Exception ex)
            {
                Hub.Log($"importing {c.Name} failed: {ex.Message}", "error");
                Hub.Emit("import.progress", new { key = c.Key, done = 0, total = 1, state = "failed", error = ex.Message });
            }
        }
        return made;
    }

    static string DefaultIcon(string loader) => loader switch
    {
        "forge" or "neoforge" => "cog",
        "fabric" or "quilt" => "sapling",
        _ => "grass",
    };

    public static async Task<JsonObject> FromFile(string path, Func<string, Task> prepare)
    {
        if (!File.Exists(path)) throw new InvalidOperationException("that file is gone");
        using var zip = ZipFile.OpenRead(path);
        var mr = zip.GetEntry("modrinth.index.json");
        var cf = zip.GetEntry("manifest.json");
        if (mr == null && cf == null) throw new InvalidOperationException("that is not a modrinth or curseforge modpack");
        JsonNode index;
        using (var reader = new StreamReader((mr ?? cf)!.Open())) index = JsonNode.Parse(reader.ReadToEnd())!;

        string name, version, loader = "vanilla";
        string? loaderVersion = null;
        if (mr != null)
        {
            name = Js.S(index["name"]) ?? Path.GetFileNameWithoutExtension(path);
            var deps = index["dependencies"] as JsonObject ?? new JsonObject();
            version = Js.S(deps["minecraft"]) ?? throw new InvalidOperationException("the pack has no minecraft version");
            foreach (var (k, v) in deps)
            {
                var l = k switch { "fabric-loader" => "fabric", "quilt-loader" => "quilt", "forge" => "forge", "neoforge" => "neoforge", _ => null };
                if (l == null) continue;
                loader = l;
                loaderVersion = Js.S(v);
            }
            if (loader == "forge" && loaderVersion != null && !loaderVersion.StartsWith(version + "-")) loaderVersion = version + "-" + loaderVersion;
        }
        else
        {
            name = Js.S(index["name"]) ?? Path.GetFileNameWithoutExtension(path);
            version = Js.S(index["minecraft"]?["version"]) ?? throw new InvalidOperationException("the pack has no minecraft version");
            var primary = (index["minecraft"]?["modLoaders"] as JsonArray)?.OfType<JsonObject>().FirstOrDefault(x => Js.B(x["primary"]) ?? false)
                ?? (index["minecraft"]?["modLoaders"] as JsonArray)?.OfType<JsonObject>().FirstOrDefault();
            var id = Js.S(primary?["id"]);
            if (id != null)
            {
                loader = NormLoader(id);
                loaderVersion = id[(id.IndexOf('-') + 1)..];
                if (loader == "forge" && !loaderVersion.StartsWith(version + "-")) loaderVersion = version + "-" + loaderVersion;
            }
        }

        var inst = Instances.Create(new JsonObject { ["name"] = name, ["version"] = version, ["loader"] = loader, ["loaderVersion"] = loaderVersion, ["icon"] = DefaultIcon(loader) });
        var instId = Js.S(inst["id"])!;
        var game = Paths.Game(instId);
        var key = "file:" + path;
        Hub.Emit("import.progress", new { key, done = 0, total = 1, state = "copying" });

        var overrides = mr != null ? new[] { "overrides/", "client-overrides/" } : new[] { (Js.S(index["overrides"]) ?? "overrides").TrimEnd('/') + "/" };
        foreach (var entry in zip.Entries)
        {
            var prefix = overrides.FirstOrDefault(o => entry.FullName.StartsWith(o, StringComparison.OrdinalIgnoreCase));
            if (prefix == null || entry.FullName.EndsWith('/')) continue;
            var dst = Path.GetFullPath(Path.Combine(game, entry.FullName[prefix.Length..]));
            if (!Paths.Inside(dst, game)) continue;
            Directory.CreateDirectory(Path.GetDirectoryName(dst)!);
            entry.ExtractToFile(dst, true);
        }

        var missing = new List<string>();
        if (mr != null)
        {
            var job = new Job { Name = name + " mods", Target = name, Kind = "mod" };
            foreach (var f in (index["files"] as JsonArray ?? new JsonArray()).OfType<JsonObject>())
            {
                if (Js.S(f["env"]?["client"]) == "unsupported") continue;
                var rel = Js.S(f["path"]);
                var url = (f["downloads"] as JsonArray)?.Select(Js.S).FirstOrDefault(u => u != null);
                if (rel == null || url == null) continue;
                var dst = Path.GetFullPath(Path.Combine(game, rel));
                if (!Paths.Inside(dst, game)) continue;
                job.Files.Add(new DlFile { Url = url, Path = dst, Sha1 = Js.S(f["hashes"]?["sha1"]), Size = Js.L(f["fileSize"]) ?? 0 });
            }
            await Downloads.Run(job, Math.Max(6, Hub.Threads));
        }
        else
        {
            var mods = Path.Combine(game, "mods");
            Directory.CreateDirectory(mods);
            var files = (index["files"] as JsonArray ?? new JsonArray()).OfType<JsonObject>().ToList();
            var job = new Job { Name = name + " mods", Target = name, Kind = "pack" };
            Hub.Emit("download.add", new { id = job.Id, name = job.Name, target = name, kind = "packfiles", icon = (string?)null, size = files.Count * 1048576L, files = files.Count });
            var done = 0;
            await Parallel.ForEachAsync(files, new ParallelOptions { MaxDegreeOfParallelism = Math.Max(4, Hub.Threads) }, async (f, ct) =>
            {
                var pid = Js.L(f["projectID"]);
                var fid = Js.L(f["fileID"]);
                try
                {
                    using var res = await Net.Http.GetAsync($"https://www.curseforge.com/api/v1/mods/{pid}/files/{fid}/download", ct);
                    res.EnsureSuccessStatusCode();
                    var fileName = Uri.UnescapeDataString(Path.GetFileName(res.RequestMessage!.RequestUri!.AbsolutePath));
                    if (string.IsNullOrWhiteSpace(fileName)) fileName = $"{pid}-{fid}.jar";
                    var bytes = await res.Content.ReadAsByteArrayAsync(ct);
                    var folder = fileName.EndsWith(".zip", StringComparison.OrdinalIgnoreCase) ? Path.Combine(game, "resourcepacks") : mods;
                    Directory.CreateDirectory(folder);
                    await File.WriteAllBytesAsync(Path.Combine(folder, Path.GetFileName(fileName)), bytes, ct);
                }
                catch
                {
                    lock (missing) missing.Add($"{pid}/{fid}");
                }
                var n = Interlocked.Increment(ref done);
                Hub.Emit("download.progress", new { id = job.Id, done = n * 1048576L, size = files.Count * 1048576L, speed = 0.0, status = "downloading" });
            });
            Hub.Emit("download.done", new { id = job.Id, ok = true });
        }

        var saved = Instances.Need(instId);
        saved["importedFrom"] = key;
        Instances.Save(saved);
        Hub.Emit("import.progress", new { key, done = 1, total = 1, state = "done", id = instId });
        Hub.Log($"imported {name} from {Path.GetFileName(path)}" + (missing.Count > 0 ? $", {missing.Count} files could not be downloaded" : ""));
        _ = prepare(instId);
        return new JsonObject { ["instance"] = Instances.WithStats(saved), ["missing"] = missing.Count };
    }
}
