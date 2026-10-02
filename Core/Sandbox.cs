using System.ComponentModel;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Security.AccessControl;
using System.Security.Principal;
using System.Text;
using Microsoft.Win32.SafeHandles;

namespace Nelya.Core;

static class Sandbox
{
    const string Name = "NelyaInstanceSandbox";
    const string WinstaCapability = "nelya.grantWinstaWriteAttributes";

    const uint FILE_GENERIC_READ = 0x120089;
    const uint FILE_GENERIC_EXECUTE = 0x1200A0;
    const uint FILE_TRAVERSE = 0x20;
    const uint FILE_ALL_ACCESS = 0x1F01FF;
    const uint WINSTA_WRITEATTRIBUTES = 0x10;
    const uint OBJECT_INHERIT_ACE = 0x1;
    const uint CONTAINER_INHERIT_ACE = 0x2;
    const int SE_FILE_OBJECT = 1;
    const int SE_WINDOW_OBJECT = 7;
    const uint DACL_SECURITY_INFORMATION = 4;

    public static string Sid()
    {
        var hr = CreateAppContainerProfile(Name, Name, "sandbox for minecraft instances run by nelya", IntPtr.Zero, 0, out var sid);
        if (hr == unchecked((int)0x800700B7)) hr = DeriveAppContainerSidFromAppContainerName(Name, out sid);
        if (hr != 0) throw new Win32Exception(hr, "could not create the sandbox container");
        try
        {
            ConvertSidToStringSidW(sid, out var str);
            var s = Marshal.PtrToStringUni(str)!;
            LocalFree(str);
            return s;
        }
        finally
        {
            FreeSid(sid);
        }
    }

    static bool HasAce(string path, SecurityIdentifier sid, uint mask, bool inherit)
    {
        try
        {
            var info = new DirectoryInfo(path);
            AuthorizationRuleCollection rules;
            if (info.Exists) rules = info.GetAccessControl(AccessControlSections.Access).GetAccessRules(true, false, typeof(SecurityIdentifier));
            else if (File.Exists(path)) rules = new FileInfo(path).GetAccessControl(AccessControlSections.Access).GetAccessRules(true, false, typeof(SecurityIdentifier));
            else return true;
            foreach (FileSystemAccessRule rule in rules)
            {
                if (rule.AccessControlType != AccessControlType.Allow || !rule.IdentityReference.Equals(sid)) continue;
                if (((uint)rule.FileSystemRights & mask) != mask) continue;
                if (inherit && rule.InheritanceFlags != (InheritanceFlags.ContainerInherit | InheritanceFlags.ObjectInherit)) continue;
                return true;
            }
        }
        catch
        {
        }
        return false;
    }

    static int AddAce(string path, string sidString, uint mask, bool inherit)
    {
        if (!ConvertStringSidToSidW(sidString, out var sid)) return Marshal.GetLastWin32Error();
        try
        {
            var err = GetNamedSecurityInfoW(path, SE_FILE_OBJECT, DACL_SECURITY_INFORMATION, IntPtr.Zero, IntPtr.Zero, out var oldAcl, IntPtr.Zero, out var oldSd);
            if (err != 0) return err;
            try
            {
                var ea = new EXPLICIT_ACCESS_W
                {
                    grfAccessPermissions = mask,
                    grfAccessMode = 1,
                    grfInheritance = inherit ? OBJECT_INHERIT_ACE | CONTAINER_INHERIT_ACE : 0,
                    Trustee = new TRUSTEE_W { TrusteeForm = 0, TrusteeType = 2, ptstrName = sid },
                };
                err = SetEntriesInAclW(1, new[] { ea }, oldAcl, out var newAcl);
                if (err != 0) return err;
                try
                {
                    if (inherit)
                        return SetNamedSecurityInfoW(path, SE_FILE_OBJECT, DACL_SECURITY_INFORMATION, IntPtr.Zero, IntPtr.Zero, newAcl, IntPtr.Zero);
                    var sd = Marshal.AllocHGlobal(64);
                    try
                    {
                        InitializeSecurityDescriptor(sd, 1);
                        SetSecurityDescriptorDacl(sd, true, newAcl, false);
                        return SetFileSecurityW(path, DACL_SECURITY_INFORMATION, sd) ? 0 : Marshal.GetLastWin32Error();
                    }
                    finally
                    {
                        Marshal.FreeHGlobal(sd);
                    }
                }
                finally
                {
                    LocalFree(newAcl);
                }
            }
            finally
            {
                LocalFree(oldSd);
            }
        }
        finally
        {
            LocalFree(sid);
        }
    }

    static List<string> Parents(IEnumerable<string> roots)
    {
        var allowed = new HashSet<string>(roots.Select(r => Path.GetFullPath(r).TrimEnd('\\')), StringComparer.OrdinalIgnoreCase);
        var parents = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var root in allowed)
        {
            var dir = Path.GetDirectoryName(root);
            while (!string.IsNullOrEmpty(dir))
            {
                if (allowed.Contains(dir.TrimEnd('\\'))) break;
                parents.Add(dir);
                dir = Path.GetDirectoryName(dir);
            }
        }
        return parents.OrderBy(p => p.Length).ToList();
    }

    public static void Grant(string sidString, IEnumerable<string> read, IEnumerable<string> write)
    {
        var sid = new SecurityIdentifier(sidString);
        var readList = read.Where(p => Directory.Exists(p) || File.Exists(p)).Distinct(StringComparer.OrdinalIgnoreCase).ToList();
        var writeList = write.Distinct(StringComparer.OrdinalIgnoreCase).ToList();
        foreach (var dir in writeList) Directory.CreateDirectory(dir);
        foreach (var path in readList)
        {
            if (HasAce(path, sid, FILE_GENERIC_READ | FILE_GENERIC_EXECUTE, Directory.Exists(path))) continue;
            var err = AddAce(path, sidString, FILE_GENERIC_READ | FILE_TRAVERSE | FILE_GENERIC_EXECUTE, Directory.Exists(path));
            if (err != 0) Hub.Log($"sandbox could not allow reading {path} ({err})", "warn");
        }
        foreach (var path in writeList)
        {
            if (HasAce(path, sid, FILE_ALL_ACCESS, true)) continue;
            var err = AddAce(path, sidString, FILE_ALL_ACCESS, true);
            if (err != 0) Hub.Log($"sandbox could not allow writing {path} ({err})", "warn");
        }
        var denied = new List<string>();
        foreach (var parent in Parents(readList.Concat(writeList)))
        {
            if (HasAce(parent, sid, FILE_GENERIC_READ | FILE_TRAVERSE, false)) continue;
            var err = AddAce(parent, sidString, FILE_GENERIC_READ | FILE_TRAVERSE, false);
            if (err == 5) denied.Add(parent);
            else if (err != 0) Hub.Log($"sandbox could not allow traversing {parent} ({err})", "warn");
        }
        if (denied.Count == 0) return;
        Hub.Log("asking windows for admin once so the sandbox can see " + string.Join(", ", denied));
        var psi = new ProcessStartInfo(Environment.ProcessPath!) { UseShellExecute = true, Verb = "runas" };
        psi.ArgumentList.Add("--set-traverse-acls");
        psi.ArgumentList.Add(sidString);
        foreach (var d in denied) psi.ArgumentList.Add(d);
        try
        {
            using var p = Process.Start(psi)!;
            p.WaitForExit();
            if (p.ExitCode != 0) throw new InvalidOperationException("windows did not let the sandbox see " + string.Join(", ", denied));
        }
        catch (Win32Exception ex) when (ex.NativeErrorCode == 1223)
        {
            throw new InvalidOperationException("the sandbox needs admin permission once, it was declined");
        }
    }

    public static int SetTraverseElevated(string[] args)
    {
        if (args.Length < 2) return 1;
        var fails = 0;
        foreach (var path in args.Skip(1))
            if (AddAce(path, args[0], FILE_GENERIC_READ | FILE_TRAVERSE, false) != 0) fails++;
        return fails == 0 ? 0 : 2;
    }

    static IntPtr WinstaCapabilitySid(out Action free)
    {
        free = () => { };
        if (!DeriveCapabilitySidsFromName(WinstaCapability, out var groups, out var groupCount, out var caps, out var capCount) || capCount == 0)
            return IntPtr.Zero;
        free = () =>
        {
            for (var i = 0; i < groupCount; i++) LocalFree(Marshal.ReadIntPtr(groups, i * IntPtr.Size));
            LocalFree(groups);
            for (var i = 0; i < capCount; i++) LocalFree(Marshal.ReadIntPtr(caps, i * IntPtr.Size));
            LocalFree(caps);
        };
        var capSid = Marshal.ReadIntPtr(caps);
        var winsta = OpenWindowStationW("winsta0", false, 0x20000 | 0x40000);
        if (winsta == IntPtr.Zero) return capSid;
        try
        {
            if (GetSecurityInfo(winsta, SE_WINDOW_OBJECT, DACL_SECURITY_INFORMATION, IntPtr.Zero, IntPtr.Zero, out var oldAcl, IntPtr.Zero, out var oldSd) != 0) return capSid;
            try
            {
                var ea = new EXPLICIT_ACCESS_W
                {
                    grfAccessPermissions = WINSTA_WRITEATTRIBUTES,
                    grfAccessMode = 1,
                    grfInheritance = 0,
                    Trustee = new TRUSTEE_W { TrusteeForm = 0, TrusteeType = 2, ptstrName = capSid },
                };
                if (SetEntriesInAclW(1, new[] { ea }, oldAcl, out var newAcl) == 0)
                {
                    SetSecurityInfo(winsta, SE_WINDOW_OBJECT, DACL_SECURITY_INFORMATION, IntPtr.Zero, IntPtr.Zero, newAcl, IntPtr.Zero);
                    LocalFree(newAcl);
                }
            }
            finally
            {
                LocalFree(oldSd);
            }
        }
        finally
        {
            CloseWindowStation(winsta);
        }
        return capSid;
    }

    static string Quote(string arg)
    {
        if (arg.Length > 0 && arg.IndexOfAny(new[] { ' ', '\t', '"' }) < 0) return arg;
        var sb = new StringBuilder("\"");
        var slashes = 0;
        foreach (var c in arg)
        {
            if (c == '\\') { slashes++; continue; }
            if (c == '"') { sb.Append('\\', slashes * 2 + 1); sb.Append('"'); slashes = 0; continue; }
            sb.Append('\\', slashes);
            slashes = 0;
            sb.Append(c);
        }
        sb.Append('\\', slashes * 2);
        sb.Append('"');
        return sb.ToString();
    }

    public static Process Start(string exe, IEnumerable<string> args, string workDir, IDictionary<string, string> env, Action<string?> onLine)
    {
        var sidString = Sid();
        if (!ConvertStringSidToSidW(sidString, out var containerSid)) throw new Win32Exception();
        var allocations = new List<IntPtr>();
        var freeWinsta = (Action)(() => { });
        var attrList = IntPtr.Zero;
        IntPtr outRead = IntPtr.Zero, outWrite = IntPtr.Zero, inRead = IntPtr.Zero, inWrite = IntPtr.Zero;
        try
        {
            var caps = new List<IntPtr>();
            foreach (var known in new[] { 86, 87, 88 })
            {
                var size = 68u;
                var buf = Marshal.AllocHGlobal((int)size);
                allocations.Add(buf);
                if (CreateWellKnownSid(known, IntPtr.Zero, buf, ref size)) caps.Add(buf);
            }
            var winstaSid = WinstaCapabilitySid(out freeWinsta);
            if (winstaSid != IntPtr.Zero) caps.Add(winstaSid);

            var capArray = Marshal.AllocHGlobal(caps.Count * (IntPtr.Size * 2));
            allocations.Add(capArray);
            for (var i = 0; i < caps.Count; i++)
            {
                Marshal.WriteIntPtr(capArray, i * IntPtr.Size * 2, caps[i]);
                Marshal.WriteInt32(capArray, i * IntPtr.Size * 2 + IntPtr.Size, 0x4);
            }
            var secCaps = Marshal.AllocHGlobal(IntPtr.Size * 2 + 8);
            allocations.Add(secCaps);
            Marshal.WriteIntPtr(secCaps, 0, containerSid);
            Marshal.WriteIntPtr(secCaps, IntPtr.Size, capArray);
            Marshal.WriteInt32(secCaps, IntPtr.Size * 2, caps.Count);
            Marshal.WriteInt32(secCaps, IntPtr.Size * 2 + 4, 0);

            var sa = new SECURITY_ATTRIBUTES { nLength = Marshal.SizeOf<SECURITY_ATTRIBUTES>(), bInheritHandle = true };
            if (!CreatePipe(out outRead, out outWrite, ref sa, 0)) throw new Win32Exception();
            SetHandleInformation(outRead, 1, 0);
            if (!CreatePipe(out inRead, out inWrite, ref sa, 0)) throw new Win32Exception();
            SetHandleInformation(inWrite, 1, 0);

            var handles = Marshal.AllocHGlobal(IntPtr.Size * 2);
            allocations.Add(handles);
            Marshal.WriteIntPtr(handles, 0, outWrite);
            Marshal.WriteIntPtr(handles, IntPtr.Size, inRead);

            var listSize = IntPtr.Zero;
            InitializeProcThreadAttributeList(IntPtr.Zero, 2, 0, ref listSize);
            attrList = Marshal.AllocHGlobal(listSize);
            if (!InitializeProcThreadAttributeList(attrList, 2, 0, ref listSize)) throw new Win32Exception();
            if (!UpdateProcThreadAttribute(attrList, 0, (IntPtr)0x20009, secCaps, (IntPtr)(IntPtr.Size * 2 + 8), IntPtr.Zero, IntPtr.Zero)) throw new Win32Exception();
            if (!UpdateProcThreadAttribute(attrList, 0, (IntPtr)0x20002, handles, (IntPtr)(IntPtr.Size * 2), IntPtr.Zero, IntPtr.Zero)) throw new Win32Exception();

            var si = new STARTUPINFOEX();
            si.StartupInfo.cb = Marshal.SizeOf<STARTUPINFOEX>();
            si.StartupInfo.dwFlags = 0x100;
            si.StartupInfo.hStdInput = inRead;
            si.StartupInfo.hStdOutput = outWrite;
            si.StartupInfo.hStdError = outWrite;
            si.lpAttributeList = attrList;

            var merged = new SortedDictionary<string, string>(StringComparer.OrdinalIgnoreCase);
            foreach (System.Collections.DictionaryEntry e in Environment.GetEnvironmentVariables()) merged[(string)e.Key] = (string?)e.Value ?? "";
            foreach (var (k, v) in env) merged[k] = v;
            var block = new StringBuilder();
            foreach (var (k, v) in merged) block.Append(k).Append('=').Append(v).Append('\0');
            block.Append('\0');

            var cmd = new StringBuilder(Quote(exe));
            foreach (var a in args) cmd.Append(' ').Append(Quote(a));

            if (!CreateProcessW(null, cmd, IntPtr.Zero, IntPtr.Zero, true, 0x00080000 | 0x00000400 | 0x08000000 | 0x00000004, block.ToString(), workDir, ref si, out var pi))
                throw new Win32Exception(Marshal.GetLastWin32Error(), "the sandbox could not start java");

            var process = Process.GetProcessById(pi.dwProcessId);
            _ = process.Handle;
            ResumeThread(pi.hThread);
            CloseHandle(pi.hThread);
            CloseHandle(pi.hProcess);
            CloseHandle(outWrite);
            outWrite = IntPtr.Zero;
            CloseHandle(inRead);
            inRead = IntPtr.Zero;
            CloseHandle(inWrite);
            inWrite = IntPtr.Zero;

            var reader = new StreamReader(new FileStream(new SafeFileHandle(outRead, true), FileAccess.Read, 4096, false), Encoding.UTF8);
            outRead = IntPtr.Zero;
            var thread = new Thread(() =>
            {
                try
                {
                    string? line;
                    while ((line = reader.ReadLine()) != null) onLine(line);
                }
                catch
                {
                }
                finally
                {
                    reader.Dispose();
                    onLine(null);
                }
            }) { IsBackground = true, Name = "sandbox output" };
            thread.Start();
            return process;
        }
        finally
        {
            if (attrList != IntPtr.Zero)
            {
                DeleteProcThreadAttributeList(attrList);
                Marshal.FreeHGlobal(attrList);
            }
            foreach (var a in allocations) Marshal.FreeHGlobal(a);
            freeWinsta();
            LocalFree(containerSid);
            foreach (var h in new[] { outRead, outWrite, inRead, inWrite }) if (h != IntPtr.Zero) CloseHandle(h);
        }
    }

    [StructLayout(LayoutKind.Sequential)]
    struct TRUSTEE_W
    {
        public IntPtr pMultipleTrustee;
        public int MultipleTrusteeOperation;
        public int TrusteeForm;
        public int TrusteeType;
        public IntPtr ptstrName;
    }

    [StructLayout(LayoutKind.Sequential)]
    struct EXPLICIT_ACCESS_W
    {
        public uint grfAccessPermissions;
        public int grfAccessMode;
        public uint grfInheritance;
        public TRUSTEE_W Trustee;
    }

    [StructLayout(LayoutKind.Sequential)]
    struct SECURITY_ATTRIBUTES
    {
        public int nLength;
        public IntPtr lpSecurityDescriptor;
        public bool bInheritHandle;
    }

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    struct STARTUPINFO
    {
        public int cb;
        public string? lpReserved, lpDesktop, lpTitle;
        public int dwX, dwY, dwXSize, dwYSize, dwXCountChars, dwYCountChars, dwFillAttribute, dwFlags;
        public short wShowWindow, cbReserved2;
        public IntPtr lpReserved2, hStdInput, hStdOutput, hStdError;
    }

    [StructLayout(LayoutKind.Sequential)]
    struct STARTUPINFOEX
    {
        public STARTUPINFO StartupInfo;
        public IntPtr lpAttributeList;
    }

    [StructLayout(LayoutKind.Sequential)]
    struct PROCESS_INFORMATION
    {
        public IntPtr hProcess, hThread;
        public int dwProcessId, dwThreadId;
    }

    [DllImport("userenv.dll", CharSet = CharSet.Unicode)]
    static extern int CreateAppContainerProfile(string name, string display, string description, IntPtr caps, int count, out IntPtr sid);

    [DllImport("userenv.dll", CharSet = CharSet.Unicode)]
    static extern int DeriveAppContainerSidFromAppContainerName(string name, out IntPtr sid);

    [DllImport("advapi32.dll", SetLastError = true)]
    static extern bool ConvertSidToStringSidW(IntPtr sid, out IntPtr str);

    [DllImport("advapi32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
    static extern bool ConvertStringSidToSidW(string str, out IntPtr sid);

    [DllImport("advapi32.dll")]
    static extern IntPtr FreeSid(IntPtr sid);

    [DllImport("advapi32.dll", SetLastError = true)]
    static extern bool CreateWellKnownSid(int type, IntPtr domain, IntPtr sid, ref uint size);

    [DllImport("kernelbase.dll", SetLastError = true, CharSet = CharSet.Unicode)]
    static extern bool DeriveCapabilitySidsFromName(string name, out IntPtr groupSids, out int groupCount, out IntPtr capSids, out int capCount);

    [DllImport("advapi32.dll", CharSet = CharSet.Unicode)]
    static extern int GetNamedSecurityInfoW(string name, int type, uint info, IntPtr owner, IntPtr group, out IntPtr dacl, IntPtr sacl, out IntPtr sd);

    [DllImport("advapi32.dll", CharSet = CharSet.Unicode)]
    static extern int SetNamedSecurityInfoW(string name, int type, uint info, IntPtr owner, IntPtr group, IntPtr dacl, IntPtr sacl);

    [DllImport("advapi32.dll")]
    static extern int GetSecurityInfo(IntPtr handle, int type, uint info, IntPtr owner, IntPtr group, out IntPtr dacl, IntPtr sacl, out IntPtr sd);

    [DllImport("advapi32.dll")]
    static extern int SetSecurityInfo(IntPtr handle, int type, uint info, IntPtr owner, IntPtr group, IntPtr dacl, IntPtr sacl);

    [DllImport("advapi32.dll", CharSet = CharSet.Unicode)]
    static extern int SetEntriesInAclW(int count, EXPLICIT_ACCESS_W[] entries, IntPtr oldAcl, out IntPtr newAcl);

    [DllImport("advapi32.dll", SetLastError = true)]
    static extern bool InitializeSecurityDescriptor(IntPtr sd, uint revision);

    [DllImport("advapi32.dll", SetLastError = true)]
    static extern bool SetSecurityDescriptorDacl(IntPtr sd, bool present, IntPtr dacl, bool defaulted);

    [DllImport("advapi32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
    static extern bool SetFileSecurityW(string name, uint info, IntPtr sd);

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    static extern IntPtr OpenWindowStationW(string name, bool inherit, uint access);

    [DllImport("user32.dll")]
    static extern bool CloseWindowStation(IntPtr winsta);

    [DllImport("kernel32.dll")]
    static extern IntPtr LocalFree(IntPtr mem);

    [DllImport("kernel32.dll", SetLastError = true)]
    static extern bool CreatePipe(out IntPtr read, out IntPtr write, ref SECURITY_ATTRIBUTES sa, int size);

    [DllImport("kernel32.dll", SetLastError = true)]
    static extern bool SetHandleInformation(IntPtr handle, int mask, int flags);

    [DllImport("kernel32.dll", SetLastError = true)]
    static extern bool InitializeProcThreadAttributeList(IntPtr list, int count, int flags, ref IntPtr size);

    [DllImport("kernel32.dll", SetLastError = true)]
    static extern bool UpdateProcThreadAttribute(IntPtr list, uint flags, IntPtr attribute, IntPtr value, IntPtr size, IntPtr prev, IntPtr ret);

    [DllImport("kernel32.dll")]
    static extern void DeleteProcThreadAttributeList(IntPtr list);

    [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
    static extern bool CreateProcessW(string? app, StringBuilder cmd, IntPtr pa, IntPtr ta, bool inherit, uint flags, string env, string dir, ref STARTUPINFOEX si, out PROCESS_INFORMATION pi);

    [DllImport("kernel32.dll")]
    static extern uint ResumeThread(IntPtr thread);

    [DllImport("kernel32.dll")]
    static extern bool CloseHandle(IntPtr handle);
}
