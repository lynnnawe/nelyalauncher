using Microsoft.Web.WebView2.Core;
using Nelya.Core;

namespace Nelya;

static class Program
{
    [STAThread]
    static int Main(string[] args)
    {
        if (args.Length > 0 && args[0] == "--set-traverse-acls") return Sandbox.SetTraverseElevated(args[1..]);
        Application.SetHighDpiMode(HighDpiMode.PerMonitorV2);
        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);
        Hub.Init();
        Updater.Start(args.Contains("--updated"));
        var launch = Array.IndexOf(args, "--launch") is var i and >= 0 && i + 1 < args.Length ? args[i + 1] : null;
        Application.Run(new LauncherContext(launch));
        Updater.ApplyPending();
        return 0;
    }
}

sealed class LauncherContext : ApplicationContext
{
    readonly string? launchId;
    CoreWebView2Environment? environment;
    ShellForm? splash;
    ShellForm? main;
    bool useSplash;

    public LauncherContext(string? launchId)
    {
        this.launchId = launchId;
        _ = StartAsync();
    }

    async Task StartAsync()
    {
        try
        {
            var dataDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "nelya", "webview");
            Directory.CreateDirectory(dataDir);
            environment = await CoreWebView2Environment.CreateAsync(null, dataDir, new CoreWebView2EnvironmentOptions("--disable-features=msSmartScreenProtection --enable-features=OverlayScrollbar"));
        }
        catch (Exception ex)
        {
            MessageBox.Show("nelya needs the Microsoft Edge WebView2 runtime.\n\n" + ex.Message, "nelya", MessageBoxButtons.OK, MessageBoxIcon.Error);
            ExitThread();
            return;
        }

        useSplash = (Js.B(Hub.Settings["splash"]) ?? true) && launchId == null;
        if (!useSplash)
        {
            CreateMain();
            return;
        }
        splash = new ShellForm(environment, "splash.html", new Size(880, 560), resizable: false);
        splash.Received += OnSplashMessage;
        splash.FormClosed += (_, _) => { if (main == null || !main.Visible) ExitThread(); };
        splash.Show();
    }

    void CreateMain()
    {
        if (main != null || environment == null) return;
        main = new ShellForm(environment, "index.html", new Size(1200, 760), resizable: true) { MinimumSize = new Size(980, 640) };
        main.Received += OnMainMessage;
        main.FormClosed += (_, _) =>
        {
            Hub.Sink = null;
            ExitThread();
        };
        main.Preload();
        main.AttachHub();
    }

    void ShowMain(Form? near)
    {
        if (main == null) return;
        var screen = (near != null ? Screen.FromControl(near) : Screen.PrimaryScreen ?? Screen.AllScreens[0]).WorkingArea;
        main.StartPosition = FormStartPosition.Manual;
        main.Location = new Point(screen.Left + (screen.Width - main.Width) / 2, screen.Top + (screen.Height - main.Height) / 2);
        main.Show();
        main.Activate();
        main.Post("shown");
        if (launchId != null) Hub.Emit("autolaunch", new { id = launchId });
    }

    void OnSplashMessage(ShellForm sender, string type, string? value)
    {
        if (type == "boot:done") CreateMain();
        else if (type == "splash:left" && main != null)
        {
            ShowMain(sender);
            sender.Close();
        }
    }

    void OnMainMessage(ShellForm sender, string type, string? value)
    {
        if (type != "ready") return;
        if (useSplash && splash != null && !splash.IsDisposed) splash.Post("leave");
        else if (!useSplash) ShowMain(null);
    }
}
