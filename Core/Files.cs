using System.Buffers.Binary;
using System.IO.Compression;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;

namespace Nelya.Core;

static class Files
{
    public static string Url(string fullPath)
    {
        var rel = Path.GetRelativePath(Paths.Root, fullPath).Replace('\\', '/');
        return "data/" + string.Join('/', rel.Split('/').Select(Uri.EscapeDataString));
    }

    public static JsonArray Worlds(string id)
    {
        var list = new JsonArray();
        var saves = Path.Combine(Paths.Game(id), "saves");
        if (!Directory.Exists(saves)) return list;
        foreach (var dir in Directory.GetDirectories(saves))
        {
            var level = Path.Combine(dir, "level.dat");
            if (!File.Exists(level)) continue;
            string? name = null;
            long? mode = null, last = null;
            var hardcore = false;
            try
            {
                if (Nbt.Read(level) is Dictionary<string, object?> root && root.TryGetValue("Data", out var d) && d is Dictionary<string, object?> data)
                {
                    name = data.GetValueOrDefault("LevelName") as string;
                    mode = data.GetValueOrDefault("GameType") is int g ? g : null;
                    last = data.GetValueOrDefault("LastPlayed") is long l ? l : null;
                    hardcore = data.GetValueOrDefault("hardcore") is sbyte h && h != 0;
                }
            }
            catch
            {
            }
            var icon = Path.Combine(dir, "icon.png");
            list.Add(new JsonObject
            {
                ["folder"] = Path.GetFileName(dir),
                ["name"] = name ?? Path.GetFileName(dir),
                ["mode"] = hardcore ? "hardcore" : mode switch { 1 => "creative", 2 => "adventure", 3 => "spectator", _ => "survival" },
                ["lastPlayed"] = last ?? new DateTimeOffset(File.GetLastWriteTimeUtc(level)).ToUnixTimeMilliseconds(),
                ["icon"] = File.Exists(icon) ? Url(icon) + "?t=" + File.GetLastWriteTimeUtc(icon).Ticks : null,
            });
        }
        return new JsonArray(list.OrderByDescending(x => Js.L(x?["lastPlayed"]) ?? 0).Select(x => x!.DeepClone()).ToArray());
    }

    public static JsonArray Screenshots(string id)
    {
        var list = new JsonArray();
        var dir = Path.Combine(Paths.Game(id), "screenshots");
        if (!Directory.Exists(dir)) return list;
        foreach (var f in new DirectoryInfo(dir).GetFiles("*.png").OrderByDescending(f => f.LastWriteTimeUtc).Take(200))
            list.Add(new JsonObject { ["name"] = f.Name, ["url"] = Url(f.FullName), ["path"] = f.FullName, ["time"] = new DateTimeOffset(f.LastWriteTimeUtc).ToUnixTimeMilliseconds() });
        return list;
    }

    public static string Log(string id)
    {
        var path = Path.Combine(Paths.Game(id), "logs", "latest.log");
        if (!File.Exists(path)) return "";
        using var fs = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.ReadWrite);
        using var reader = new StreamReader(fs);
        var lines = reader.ReadToEnd().Split('\n');
        return string.Join('\n', lines.Skip(Math.Max(0, lines.Length - 800)));
    }

    public static async Task<string> ShareLog(string text)
    {
        using var content = new FormUrlEncodedContent(new Dictionary<string, string> { ["content"] = text });
        using var res = await Net.Http.PostAsync("https://api.mclo.gs/1/log", content);
        using var doc = JsonDocument.Parse(await res.Content.ReadAsStringAsync());
        if (doc.RootElement.TryGetProperty("url", out var url)) return url.GetString()!;
        throw new InvalidOperationException("mclo.gs did not accept the log");
    }

    public static long DirSize(string dir)
    {
        if (!Directory.Exists(dir)) return 0;
        return new DirectoryInfo(dir).EnumerateFiles("*", SearchOption.AllDirectories).Sum(f => f.Length);
    }

    public static string SafePath(string id, string? sub)
    {
        var baseDir = id == "" ? Paths.Root : Paths.Game(id);
        var path = string.IsNullOrEmpty(sub) ? baseDir : Path.GetFullPath(Path.Combine(baseDir, sub));
        if (!Paths.Inside(path, Paths.Root) && !path.Equals(Paths.Root, StringComparison.OrdinalIgnoreCase)) throw new InvalidOperationException("bad path");
        return path;
    }
}

static class Nbt
{
    public static object? Read(string path)
    {
        using var fs = File.OpenRead(path);
        using var gz = new GZipStream(fs, CompressionMode.Decompress);
        using var ms = new MemoryStream();
        gz.CopyTo(ms);
        var data = ms.ToArray();
        var pos = 0;
        var type = data[pos++];
        if (type != 10) return null;
        ReadString(data, ref pos);
        return Payload(data, ref pos, 10);
    }

    static string ReadString(byte[] d, ref int pos)
    {
        var len = BinaryPrimitives.ReadUInt16BigEndian(d.AsSpan(pos));
        pos += 2;
        var s = Encoding.UTF8.GetString(d, pos, len);
        pos += len;
        return s;
    }

    static object? Payload(byte[] d, ref int pos, byte type)
    {
        switch (type)
        {
            case 1: return (sbyte)d[pos++];
            case 2: { var v = BinaryPrimitives.ReadInt16BigEndian(d.AsSpan(pos)); pos += 2; return v; }
            case 3: { var v = BinaryPrimitives.ReadInt32BigEndian(d.AsSpan(pos)); pos += 4; return v; }
            case 4: { var v = BinaryPrimitives.ReadInt64BigEndian(d.AsSpan(pos)); pos += 8; return v; }
            case 5: { var v = BinaryPrimitives.ReadSingleBigEndian(d.AsSpan(pos)); pos += 4; return v; }
            case 6: { var v = BinaryPrimitives.ReadDoubleBigEndian(d.AsSpan(pos)); pos += 8; return v; }
            case 7: { var n = BinaryPrimitives.ReadInt32BigEndian(d.AsSpan(pos)); pos += 4 + n; return null; }
            case 8: return ReadString(d, ref pos);
            case 9:
            {
                var inner = d[pos++];
                var n = BinaryPrimitives.ReadInt32BigEndian(d.AsSpan(pos));
                pos += 4;
                var list = new List<object?>();
                for (var i = 0; i < n; i++) list.Add(Payload(d, ref pos, inner));
                return list;
            }
            case 10:
            {
                var map = new Dictionary<string, object?>();
                while (true)
                {
                    var t = d[pos++];
                    if (t == 0) break;
                    var name = ReadString(d, ref pos);
                    map[name] = Payload(d, ref pos, t);
                }
                return map;
            }
            case 11: { var n = BinaryPrimitives.ReadInt32BigEndian(d.AsSpan(pos)); pos += 4 + n * 4; return null; }
            case 12: { var n = BinaryPrimitives.ReadInt32BigEndian(d.AsSpan(pos)); pos += 4 + n * 8; return null; }
            default: throw new InvalidDataException("bad nbt tag " + type);
        }
    }
}
