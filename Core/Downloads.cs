using System.Collections.Concurrent;
using System.Diagnostics;
using System.Security.Cryptography;

namespace Nelya.Core;

sealed class DlFile
{
    public required string Url;
    public required string Path;
    public string? Sha1;
    public long Size;
}

sealed class Job
{
    static int seq;
    public readonly string Id = "d" + Interlocked.Increment(ref seq);
    public required string Name;
    public string Target = "";
    public string Kind = "game";
    public string? Icon;
    public readonly List<DlFile> Files = new();
    public long Total;
    public long Done;
    public readonly CancellationTokenSource Cts = new();
}

static class Downloads
{
    static readonly ConcurrentDictionary<string, Job> Active = new();
    static readonly SemaphoreSlim ModGate = new(1, 1);

    public static bool Missing(DlFile f)
    {
        var info = new FileInfo(f.Path);
        return !info.Exists || (f.Size > 0 && info.Length != f.Size);
    }

    public static async Task Run(Job job, int parallel = 0, CancellationToken outer = default)
    {
        var todo = job.Files.Where(Missing)
            .GroupBy(f => f.Path, StringComparer.OrdinalIgnoreCase)
            .Select(g => g.First())
            .ToList();
        if (todo.Count == 0) return;

        using var link = CancellationTokenSource.CreateLinkedTokenSource(job.Cts.Token, outer);
        var ct = link.Token;
        job.Total = todo.Sum(f => Math.Max(0, f.Size));
        Active[job.Id] = job;
        Hub.Emit("download.add", new { id = job.Id, name = job.Name, target = job.Target, kind = job.Kind, icon = job.Icon, size = job.Total, files = todo.Count });

        var gated = Hub.OneAtATime && job.Kind == "mod";
        var sw = Stopwatch.StartNew();
        long lastDone = 0;
        double lastTime = 0, speed = 0;
        void Report()
        {
            var now = sw.Elapsed.TotalSeconds;
            var done = Interlocked.Read(ref job.Done);
            var dt = Math.Max(0.05, now - lastTime);
            var inst = (done - lastDone) / dt;
            speed = speed <= 0 ? inst : speed * 0.6 + inst * 0.4;
            lastDone = done;
            lastTime = now;
            Hub.Emit("download.progress", new { id = job.Id, done, size = Interlocked.Read(ref job.Total), speed = speed / 1048576.0, status = "downloading" });
        }

        try
        {
            if (gated) await ModGate.WaitAsync(ct);
            using var timer = new System.Threading.Timer(_ => Report(), null, 150, 250);
            try
            {
                var degree = parallel > 0 ? parallel : gated ? 1 : Hub.Threads;
                await Parallel.ForEachAsync(todo, new ParallelOptions { MaxDegreeOfParallelism = degree, CancellationToken = ct }, async (f, token) => await Fetch(job, f, token));
            }
            finally
            {
                if (gated) ModGate.Release();
            }
            Report();
            Hub.Emit("download.done", new { id = job.Id, ok = true });
        }
        catch (OperationCanceledException)
        {
            Hub.Emit("download.done", new { id = job.Id, ok = false, cancelled = true });
            throw;
        }
        catch (Exception ex)
        {
            Hub.Emit("download.done", new { id = job.Id, ok = false, error = ex.Message });
            Hub.Log($"download failed: {job.Name}: {ex.Message}", "error");
            throw;
        }
        finally
        {
            Active.TryRemove(job.Id, out _);
        }
    }

    static async Task Fetch(Job job, DlFile f, CancellationToken ct)
    {
        Directory.CreateDirectory(System.IO.Path.GetDirectoryName(f.Path)!);
        var part = f.Path + ".part";
        for (var attempt = 1; ; attempt++)
        {
            long got = 0;
            try
            {
                using var res = await Net.Http.GetAsync(f.Url, HttpCompletionOption.ResponseHeadersRead, ct);
                res.EnsureSuccessStatusCode();
                if (f.Size <= 0 && res.Content.Headers.ContentLength is long length)
                {
                    f.Size = length;
                    Interlocked.Add(ref job.Total, length);
                }
                using var sha = IncrementalHash.CreateHash(HashAlgorithmName.SHA1);
                await using (var src = await res.Content.ReadAsStreamAsync(ct))
                await using (var dst = new FileStream(part, FileMode.Create, FileAccess.Write, FileShare.None, 1 << 16, true))
                {
                    var buffer = new byte[1 << 16];
                    int n;
                    while ((n = await src.ReadAsync(buffer, ct)) > 0)
                    {
                        await dst.WriteAsync(buffer.AsMemory(0, n), ct);
                        sha.AppendData(buffer, 0, n);
                        got += n;
                        Interlocked.Add(ref job.Done, n);
                    }
                }
                var hash = Convert.ToHexString(sha.GetHashAndReset());
                if (!string.IsNullOrEmpty(f.Sha1) && !hash.Equals(f.Sha1, StringComparison.OrdinalIgnoreCase))
                    throw new IOException("checksum mismatch for " + System.IO.Path.GetFileName(f.Path));
                File.Move(part, f.Path, true);
                return;
            }
            catch (OperationCanceledException)
            {
                TryDelete(part);
                throw;
            }
            catch when (attempt < 4)
            {
                Interlocked.Add(ref job.Done, -got);
                TryDelete(part);
                await Task.Delay(500 * attempt, ct);
            }
        }
    }

    static void TryDelete(string path)
    {
        try
        {
            File.Delete(path);
        }
        catch
        {
        }
    }

    public static void Cancel(string id)
    {
        if (Active.TryGetValue(id, out var job)) job.Cts.Cancel();
    }

    public static async Task<string> Sha1Of(string path)
    {
        await using var fs = File.OpenRead(path);
        return Convert.ToHexString(await SHA1.HashDataAsync(fs)).ToLowerInvariant();
    }
}
