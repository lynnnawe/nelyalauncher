using System.IO.Compression;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;

namespace Nelya.Core;

static class Mods
{
    const string Api = "https://api.modrinth.com/v2";
    static readonly Dictionary<string, (DateTime At, JsonObject Data)> UpdateCache = new();

    static string Dir(string id) => Path.Combine(Paths.Game(id), "mods");
    static string IndexPath(string id) => Path.Combine(Paths.Instance(id), "mods.json");

    static JsonArray Index(string id) => Js.Read(IndexPath(id)) as JsonArray ?? new JsonArray();

    static void SaveIndex(string id, JsonArray index) => Js.Write(IndexPath(id), index);

    static string[] Loaders(string loader) => loader switch
    {
        "quilt" => new[] { "quilt", "fabric" },
        _ => new[] { loader },
    };

    static async Task<JsonNode> Post(string url, object body)
    {
        using var content = new StringContent(JsonSerializer.Serialize(body), Encoding.UTF8, "application/json");
        using var res = await Net.Http.PostAsync(url, content);
        res.EnsureSuccessStatusCode();
        return JsonNode.Parse(await res.Content.ReadAsStringAsync()) ?? new JsonObject();
    }

    static async Task<JsonObject?> BestVersion(string projectId, string loader, string mc)
    {
        var url = $"{Api}/project/{Uri.EscapeDataString(projectId)}/version?loaders={Uri.EscapeDataString(JsonSerializer.Serialize(Loaders(loader)))}&game_versions={Uri.EscapeDataString(JsonSerializer.Serialize(new[] { mc }))}";
        var list = await Net.Json(url);
        var versions = list.AsArray().OfType<JsonObject>().ToList();
        return versions.FirstOrDefault(v => Js.S(v["version_type"]) == "release") ?? versions.FirstOrDefault();
    }

    static JsonObject? PrimaryFile(JsonObject version) =>
        (version["files"] as JsonArray)?.OfType<JsonObject>().FirstOrDefault(f => Js.B(f["primary"]) ?? false)
        ?? (version["files"] as JsonArray)?.OfType<JsonObject>().FirstOrDefault();

    public static async Task<JsonObject> Plan(string id, string versionId)
    {
        var inst = Instances.Need(id);
        var loader = Js.S(inst["loader"])!;
        var mc = Js.S(inst["version"])!;
        var index = Index(id);
        var have = new HashSet<string>(index.OfType<JsonObject>().Select(e => Js.S(e["projectId"]) ?? "").Where(s => s.Length > 0));
        var root = (JsonObject)await Net.Json($"{Api}/version/{versionId}");
        var queue = new Queue<(JsonObject Version, int Depth)>();
        queue.Enqueue((root, 0));
        var plan = new List<JsonObject>();
        var seen = new HashSet<string> { Js.S(root["project_id"])! };
        var missing = new List<string>();
        while (queue.Count > 0)
        {
            var (version, depth) = queue.Dequeue();
            plan.Add(version);
            if (depth >= 4 || version["dependencies"] is not JsonArray deps) continue;
            foreach (var dep in deps.OfType<JsonObject>())
            {
                if (Js.S(dep["dependency_type"]) != "required") continue;
                var pid = Js.S(dep["project_id"]);
                JsonObject? v = null;
                if (pid != null && (seen.Contains(pid) || have.Contains(pid))) continue;
                if (Js.S(dep["version_id"]) is string vid)
                {
                    try
                    {
                        v = (JsonObject)await Net.Json($"{Api}/version/{vid}");
                    }
                    catch
                    {
                    }
                }
                if (v == null && pid != null) v = await BestVersion(pid, loader, mc);
                if (v == null)
                {
                    if (pid != null) missing.Add(pid);
                    continue;
                }
                pid = Js.S(v["project_id"])!;
                if (seen.Contains(pid) || have.Contains(pid)) continue;
                seen.Add(pid);
                queue.Enqueue((v, depth + 1));
            }
        }
        var ids = plan.Select(v => Js.S(v["project_id"])!).Concat(missing).Distinct().ToList();
        var projects = (await Net.Json($"{Api}/projects?ids={Uri.EscapeDataString(JsonSerializer.Serialize(ids))}")).AsArray().OfType<JsonObject>().ToDictionary(p => Js.S(p["id"])!);
        var items = new JsonArray();
        foreach (var v in plan)
        {
            var pid = Js.S(v["project_id"])!;
            projects.TryGetValue(pid, out var proj);
            var file = PrimaryFile(v);
            items.Add(new JsonObject
            {
                ["projectId"] = pid,
                ["versionId"] = Js.S(v["id"]),
                ["title"] = Js.S(proj?["title"]) ?? pid,
                ["icon"] = Js.S(proj?["icon_url"]),
                ["version"] = Js.S(v["version_number"]),
                ["file"] = Js.S(file?["filename"]),
                ["size"] = Js.L(file?["size"]) ?? 0,
            });
        }
        return new JsonObject
        {
            ["items"] = items,
            ["missing"] = new JsonArray(missing.Select(m => (JsonNode?)JsonValue.Create(Js.S(projects.GetValueOrDefault(m)?["title"]) ?? m)).ToArray()),
        };
    }

    public static async Task<JsonArray> Install(string id, JsonArray items, string target)
    {
        var dir = Dir(id);
        Directory.CreateDirectory(dir);
        var tasks = new List<Task<JsonObject?>>();
        foreach (var item in items.OfType<JsonObject>())
        {
            tasks.Add(Task.Run(async () =>
            {
                var version = (JsonObject)await Net.Json($"{Api}/version/{Js.S(item["versionId"])}");
                var file = PrimaryFile(version);
                if (file == null) return null;
                var filename = Path.GetFileName(Js.S(file["filename"])!);
                var job = new Job { Name = $"{Js.S(item["title"])} {Js.S(version["version_number"])}", Target = target, Kind = "mod", Icon = Js.S(item["icon"]) };
                job.Files.Add(new DlFile { Url = Js.S(file["url"])!, Path = Path.Combine(dir, filename), Sha1 = Js.S(file["hashes"]?["sha1"]), Size = Js.L(file["size"]) ?? 0 });
                await Downloads.Run(job);
                return new JsonObject
                {
                    ["file"] = filename,
                    ["projectId"] = Js.S(version["project_id"]),
                    ["versionId"] = Js.S(version["id"]),
                    ["title"] = Js.S(item["title"]),
                    ["version"] = Js.S(version["version_number"]),
                    ["icon"] = Js.S(item["icon"]),
                    ["sha1"] = Js.S(file["hashes"]?["sha1"]),
                };
            }));
        }
        var results = await Task.WhenAll(tasks);
        var index = Index(id);
        foreach (var entry in results.Where(r => r != null))
        {
            var pid = Js.S(entry!["projectId"]);
            foreach (var old in index.OfType<JsonObject>().Where(e => Js.S(e["projectId"]) == pid).ToList())
            {
                var oldFile = Js.S(old["file"]);
                if (oldFile != null && oldFile != Js.S(entry["file"]))
                {
                    TryDelete(Path.Combine(dir, oldFile));
                    TryDelete(Path.Combine(dir, oldFile + ".disabled"));
                }
                index.Remove(old);
            }
            index.Add(entry);
        }
        SaveIndex(id, index);
        UpdateCache.Remove(id);
        Hub.Log($"installed {string.Join(", ", results.Where(r => r != null).Select(r => Js.S(r!["title"])))} into {target}");
        return new JsonArray(results.Where(r => r != null).Select(r => r!.DeepClone()).ToArray());
    }

    static void TryDelete(string path)
    {
        try
        {
            if (File.Exists(path)) File.Delete(path);
        }
        catch
        {
        }
    }

    static (string? Name, string? Version) ReadJarMeta(string path)
    {
        try
        {
            using var zip = ZipFile.OpenRead(path);
            string? Text(string name)
            {
                var e = zip.GetEntry(name);
                if (e == null) return null;
                using var r = new StreamReader(e.Open());
                return r.ReadToEnd();
            }
            if (Text("fabric.mod.json") is string fabric)
            {
                var n = JsonNode.Parse(fabric, documentOptions: new JsonDocumentOptions { AllowTrailingCommas = true, CommentHandling = JsonCommentHandling.Skip });
                return (Js.S(n?["name"]) ?? Js.S(n?["id"]), Js.S(n?["version"]));
            }
            if (Text("quilt.mod.json") is string quilt)
            {
                var n = JsonNode.Parse(quilt);
                return (Js.S(n?["quilt_loader"]?["metadata"]?["name"]) ?? Js.S(n?["quilt_loader"]?["id"]), Js.S(n?["quilt_loader"]?["version"]));
            }
            if ((Text("META-INF/neoforge.mods.toml") ?? Text("META-INF/mods.toml")) is string toml)
            {
                var name = Regex.Match(toml, "displayName\\s*=\\s*\"([^\"]+)\"").Groups[1].Value;
                var version = Regex.Match(toml, "\\bversion\\s*=\\s*\"([^\"]+)\"").Groups[1].Value;
                return (name.Length > 0 ? name : null, version.Length > 0 && !version.Contains("${") ? version : null);
            }
            if (Text("mcmod.info") is string info)
            {
                var n = JsonNode.Parse(info);
                var first = n is JsonArray a ? a.FirstOrDefault() : n?["modList"]?[0];
                return (Js.S(first?["name"]), Js.S(first?["version"]));
            }
        }
        catch
        {
        }
        return (null, null);
    }

    public static async Task<JsonArray> List(string id)
    {
        var dir = Dir(id);
        var list = new JsonArray();
        if (!Directory.Exists(dir)) return list;
        var index = Index(id);
        var changed = false;
        var unknown = new List<(JsonObject Row, string Path)>();
        foreach (var path in Directory.EnumerateFiles(dir).Where(f => f.EndsWith(".jar", StringComparison.OrdinalIgnoreCase) || f.EndsWith(".jar.disabled", StringComparison.OrdinalIgnoreCase)))
        {
            var fileName = Path.GetFileName(path);
            var enabled = !fileName.EndsWith(".disabled", StringComparison.OrdinalIgnoreCase);
            var baseName = enabled ? fileName : fileName[..^9];
            var entry = index.OfType<JsonObject>().FirstOrDefault(e => string.Equals(Js.S(e["file"]), baseName, StringComparison.OrdinalIgnoreCase));
            var info = new FileInfo(path);
            var row = new JsonObject
            {
                ["file"] = baseName,
                ["enabled"] = enabled,
                ["size"] = info.Length,
                ["title"] = Js.S(entry?["title"]),
                ["version"] = Js.S(entry?["version"]),
                ["icon"] = Js.S(entry?["icon"]),
                ["projectId"] = Js.S(entry?["projectId"]),
                ["versionId"] = Js.S(entry?["versionId"]),
            };
            if (entry == null)
            {
                var (name, version) = ReadJarMeta(path);
                row["title"] = name ?? Path.GetFileNameWithoutExtension(baseName);
                row["version"] = version;
                unknown.Add((row, path));
            }
            list.Add(row);
        }
        if (unknown.Count > 0)
        {
            try
            {
                var hashes = new Dictionary<string, (JsonObject Row, string Path)>();
                foreach (var u in unknown) hashes[await Downloads.Sha1Of(u.Path)] = u;
                var found = await Post($"{Api}/version_files", new { hashes = hashes.Keys.ToArray(), algorithm = "sha1" }) as JsonObject;
                if (found != null && found.Count > 0)
                {
                    var pids = found.Select(kv => Js.S(kv.Value?["project_id"])).Where(p => p != null).Distinct().ToList();
                    var projects = (await Net.Json($"{Api}/projects?ids={Uri.EscapeDataString(JsonSerializer.Serialize(pids))}")).AsArray().OfType<JsonObject>().ToDictionary(p => Js.S(p["id"])!);
                    foreach (var (hash, version) in found)
                    {
                        if (!hashes.TryGetValue(hash, out var u) || version == null) continue;
                        var pid = Js.S(version["project_id"])!;
                        projects.TryGetValue(pid, out var proj);
                        u.Row["title"] = Js.S(proj?["title"]) ?? Js.S(u.Row["title"]);
                        u.Row["icon"] = Js.S(proj?["icon_url"]);
                        u.Row["projectId"] = pid;
                        u.Row["versionId"] = Js.S(version["id"]);
                        u.Row["version"] = Js.S(version["version_number"]) ?? Js.S(u.Row["version"]);
                        index.Add(new JsonObject
                        {
                            ["file"] = Js.S(u.Row["file"]),
                            ["projectId"] = pid,
                            ["versionId"] = Js.S(version["id"]),
                            ["title"] = Js.S(u.Row["title"]),
                            ["version"] = Js.S(u.Row["version"]),
                            ["icon"] = Js.S(u.Row["icon"]),
                            ["sha1"] = hash.ToLowerInvariant(),
                        });
                        changed = true;
                    }
                }
            }
            catch
            {
            }
        }
        var present = new HashSet<string>(list.OfType<JsonObject>().Select(r => Js.S(r["file"])!), StringComparer.OrdinalIgnoreCase);
        foreach (var stale in index.OfType<JsonObject>().Where(e => !present.Contains(Js.S(e["file"]) ?? "")).ToList())
        {
            index.Remove(stale);
            changed = true;
        }
        if (changed) SaveIndex(id, index);
        return new JsonArray(list.OrderBy(r => Js.S(r?["title"]) ?? "", StringComparer.OrdinalIgnoreCase).Select(r => r!.DeepClone()).ToArray());
    }

    public static void Toggle(string id, string file, bool enabled)
    {
        var dir = Dir(id);
        var on = Path.Combine(dir, Path.GetFileName(file));
        var off = on + ".disabled";
        if (enabled && File.Exists(off)) File.Move(off, on, true);
        if (!enabled && File.Exists(on)) File.Move(on, off, true);
    }

    public static void Remove(string id, string file)
    {
        var dir = Dir(id);
        var name = Path.GetFileName(file);
        TryDelete(Path.Combine(dir, name));
        TryDelete(Path.Combine(dir, name + ".disabled"));
        var index = Index(id);
        foreach (var e in index.OfType<JsonObject>().Where(e => string.Equals(Js.S(e["file"]), name, StringComparison.OrdinalIgnoreCase)).ToList()) index.Remove(e);
        SaveIndex(id, index);
        UpdateCache.Remove(id);
    }

    public static async Task<JsonObject> Updates(string id, bool force = false)
    {
        if (!force && UpdateCache.TryGetValue(id, out var cached) && DateTime.UtcNow - cached.At < TimeSpan.FromMinutes(20)) return cached.Data;
        var inst = Instances.Need(id);
        var index = Index(id);
        var dir = Dir(id);
        var byHash = new Dictionary<string, JsonObject>();
        var changed = false;
        foreach (var e in index.OfType<JsonObject>())
        {
            var file = Js.S(e["file"]);
            if (file == null) continue;
            var path = Path.Combine(dir, file);
            if (!File.Exists(path)) path += ".disabled";
            if (!File.Exists(path)) continue;
            var sha = Js.S(e["sha1"]);
            if (sha == null)
            {
                sha = await Downloads.Sha1Of(path);
                e["sha1"] = sha;
                changed = true;
            }
            byHash[sha.ToLowerInvariant()] = e;
        }
        if (changed) SaveIndex(id, index);
        var result = new JsonObject();
        if (byHash.Count > 0)
        {
            var found = await Post($"{Api}/version_files/update", new
            {
                hashes = byHash.Keys.ToArray(),
                algorithm = "sha1",
                loaders = Loaders(Js.S(inst["loader"])!),
                game_versions = new[] { Js.S(inst["version"]) },
            }) as JsonObject;
            if (found != null)
            {
                foreach (var (hash, version) in found)
                {
                    if (version == null || !byHash.TryGetValue(hash.ToLowerInvariant(), out var e)) continue;
                    if (Js.S(version["id"]) == Js.S(e["versionId"])) continue;
                    result[Js.S(e["file"])!] = new JsonObject
                    {
                        ["versionId"] = Js.S(version["id"]),
                        ["version"] = Js.S(version["version_number"]),
                        ["projectId"] = Js.S(e["projectId"]),
                        ["title"] = Js.S(e["title"]),
                        ["icon"] = Js.S(e["icon"]),
                    };
                }
            }
        }
        UpdateCache[id] = (DateTime.UtcNow, result);
        return result;
    }
}
