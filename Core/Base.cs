using System.Net;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;

namespace Nelya.Core;

static class Paths
{
    public static readonly string Root = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "nelya");
    public static string Versions => Path.Combine(Root, "versions");
    public static string Libraries => Path.Combine(Root, "libraries");
    public static string Assets => Path.Combine(Root, "assets");
    public static string Runtime => Path.Combine(Root, "runtime");
    public static string Instances => Path.Combine(Root, "instances");
    public static string Cache => Path.Combine(Root, "cache");
    public static string Logs => Path.Combine(Root, "logs");
    public static string Sync => Path.Combine(Root, "sync");
    public static string Data => Path.Combine(Root, "data");

    public static string Instance(string id) => Path.Combine(Instances, id);
    public static string Game(string id) => Path.Combine(Instances, id, "minecraft");

    public static void Ensure()
    {
        foreach (var dir in new[] { Root, Versions, Libraries, Assets, Runtime, Instances, Cache, Logs, Sync, Data })
            Directory.CreateDirectory(dir);
        var profiles = Path.Combine(Root, "launcher_profiles.json");
        if (!File.Exists(profiles))
            File.WriteAllText(profiles, "{\"profiles\":{},\"selectedProfile\":\"\",\"clientToken\":\"" + Guid.NewGuid().ToString("N") + "\"}");
    }

    public static bool Inside(string path, string root)
    {
        var full = Path.GetFullPath(path);
        var baseDir = Path.GetFullPath(root).TrimEnd(Path.DirectorySeparatorChar) + Path.DirectorySeparatorChar;
        return full.StartsWith(baseDir, StringComparison.OrdinalIgnoreCase);
    }
}

static class Js
{
    public static readonly JsonSerializerOptions Pretty = new() { WriteIndented = true };

    public static JsonNode? Read(string path)
    {
        try
        {
            return File.Exists(path) ? JsonNode.Parse(File.ReadAllText(path)) : null;
        }
        catch
        {
            return null;
        }
    }

    public static void Write(string path, JsonNode node)
    {
        Directory.CreateDirectory(Path.GetDirectoryName(path)!);
        var tmp = path + ".tmp";
        File.WriteAllText(tmp, node.ToJsonString(Pretty));
        File.Move(tmp, path, true);
    }

    public static string? S(JsonNode? n)
    {
        if (n is JsonValue v)
        {
            if (v.TryGetValue<string>(out var s)) return s;
            if (v.TryGetValue<JsonElement>(out var e) && e.ValueKind == JsonValueKind.String) return e.GetString();
        }
        return null;
    }

    public static long? L(JsonNode? n)
    {
        if (n is not JsonValue v) return null;
        if (v.TryGetValue<long>(out var l)) return l;
        if (v.TryGetValue<int>(out var i)) return i;
        if (v.TryGetValue<double>(out var d)) return (long)d;
        if (v.TryGetValue<JsonElement>(out var e) && e.ValueKind == JsonValueKind.Number && e.TryGetInt64(out var el)) return el;
        if (v.TryGetValue<JsonElement>(out var e2) && e2.ValueKind == JsonValueKind.Number) return (long)e2.GetDouble();
        return null;
    }

    public static double? D(JsonNode? n)
    {
        if (n is not JsonValue v) return null;
        if (v.TryGetValue<double>(out var d)) return d;
        if (v.TryGetValue<long>(out var l)) return l;
        if (v.TryGetValue<int>(out var i)) return i;
        if (v.TryGetValue<JsonElement>(out var e) && e.ValueKind == JsonValueKind.Number) return e.GetDouble();
        return null;
    }

    public static bool? B(JsonNode? n)
    {
        if (n is not JsonValue v) return null;
        if (v.TryGetValue<bool>(out var b)) return b;
        if (v.TryGetValue<JsonElement>(out var e) && (e.ValueKind == JsonValueKind.True || e.ValueKind == JsonValueKind.False)) return e.GetBoolean();
        return null;
    }
}

static class Hub
{
    public static Action<string>? Sink;
    public static JsonObject Settings = new();
    public static readonly string Version = typeof(Hub).Assembly.GetName().Version is { } v ? $"{v.Major}.{v.Minor}.{v.Build}" : "0.0.0";

    public static int Threads => (int)Math.Clamp(Js.L(Settings["threads"]) ?? 6, 1, 32);
    public static bool OneAtATime => Js.B(Settings["oneAtATime"]) ?? false;

    public static void Emit(string name, object? data)
    {
        var sink = Sink;
        if (sink == null) return;
        try
        {
            sink(JsonSerializer.Serialize(new { type = "event", name, data }));
        }
        catch
        {
        }
    }

    public static void Log(string text, string lvl = "info")
    {
        Emit("log", new { text, lvl });
        try
        {
            File.AppendAllText(Path.Combine(Paths.Logs, "launcher.log"), $"[{DateTime.Now:HH:mm:ss}] [{lvl}] {text}{Environment.NewLine}");
        }
        catch
        {
        }
    }

    public static void Init()
    {
        Paths.Ensure();
        Settings = Store.Get("settings") as JsonObject ?? new JsonObject();
        try
        {
            var log = Path.Combine(Paths.Logs, "launcher.log");
            if (File.Exists(log) && new FileInfo(log).Length > 2_000_000) File.Delete(log);
        }
        catch
        {
        }
    }
}

static class Store
{
    static readonly Regex KeyPattern = new("^[a-z0-9-]{1,40}$", RegexOptions.Compiled);

    static string FileOf(string key)
    {
        if (!KeyPattern.IsMatch(key)) throw new InvalidOperationException("bad store key");
        return Path.Combine(Paths.Data, key + ".json");
    }

    public static JsonNode? Get(string key) => Js.Read(FileOf(key));

    public static void Set(string key, JsonNode? value) => Js.Write(FileOf(key), value ?? new JsonObject());
}

static class Net
{
    public static readonly HttpClient Http;

    static Net()
    {
        Http = new HttpClient(new SocketsHttpHandler
        {
            MaxConnectionsPerServer = 32,
            AutomaticDecompression = DecompressionMethods.All,
            PooledConnectionLifetime = TimeSpan.FromMinutes(5),
        })
        {
            Timeout = TimeSpan.FromMinutes(5),
        };
        Http.DefaultRequestHeaders.UserAgent.ParseAdd("nelya-launcher/" + Hub.Version);
    }

    public static async Task<JsonNode> Json(string url, CancellationToken ct = default)
    {
        var text = await Http.GetStringAsync(url, ct);
        return JsonNode.Parse(text) ?? throw new InvalidOperationException("empty response from " + url);
    }

    public static async Task<JsonNode> Cached(string url, string name, TimeSpan maxAge, CancellationToken ct = default)
    {
        var file = Path.Combine(Paths.Cache, name);
        if (File.Exists(file) && DateTime.UtcNow - File.GetLastWriteTimeUtc(file) < maxAge && Js.Read(file) is JsonNode fresh) return fresh;
        try
        {
            var text = await Http.GetStringAsync(url, ct);
            var node = JsonNode.Parse(text) ?? throw new InvalidOperationException("empty response");
            Directory.CreateDirectory(Paths.Cache);
            File.WriteAllText(file, text);
            return node;
        }
        catch when (Js.Read(file) is JsonNode stale)
        {
            return stale;
        }
    }
}
