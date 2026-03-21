using System;
using System.Diagnostics;
using System.IO;
using System.ServiceProcess;
using System.Text;

namespace CotizadorPmServiceHost
{
    internal static class Program
    {
        private static void Main(string[] args)
        {
            string serviceName = GetArg(args, "--service-name") ?? "CotizadorPocketBase";
            string rootDir = GetArg(args, "--root");

            if (string.IsNullOrWhiteSpace(rootDir))
            {
                rootDir = AppDomain.CurrentDomain.BaseDirectory;
            }

            rootDir = Path.GetFullPath(rootDir);
            ServiceBase.Run(new CotizadorService(serviceName, rootDir));
        }

        private static string GetArg(string[] args, string key)
        {
            if (args == null || args.Length == 0 || string.IsNullOrWhiteSpace(key))
            {
                return null;
            }

            for (int i = 0; i < args.Length; i++)
            {
                if (!string.Equals(args[i], key, StringComparison.OrdinalIgnoreCase))
                {
                    continue;
                }

                int next = i + 1;
                if (next < args.Length)
                {
                    return args[next];
                }

                return null;
            }

            return null;
        }
    }

    internal sealed class CotizadorService : ServiceBase
    {
        private readonly string _rootDir;
        private readonly string _logFile;
        private readonly object _sync = new object();
        private Process _child;

        public CotizadorService(string serviceName, string rootDir)
        {
            ServiceName = string.IsNullOrWhiteSpace(serviceName) ? "CotizadorPocketBase" : serviceName.Trim();
            CanStop = true;
            CanShutdown = true;
            AutoLog = false;
            _rootDir = string.IsNullOrWhiteSpace(rootDir) ? AppDomain.CurrentDomain.BaseDirectory : rootDir.Trim();
            _logFile = Path.Combine(_rootDir, "logs", "service-host.log");
        }

        protected override void OnStart(string[] args)
        {
            Log("OnStart llamado.");
            StartChildProcess();
        }

        protected override void OnStop()
        {
            Log("OnStop llamado.");
            StopChildProcess();
        }

        protected override void OnShutdown()
        {
            Log("OnShutdown llamado.");
            StopChildProcess();
            base.OnShutdown();
        }

        private void StartChildProcess()
        {
            lock (_sync)
            {
                if (_child != null && !_child.HasExited)
                {
                    Log("Proceso hijo ya estaba ejecutandose.");
                    return;
                }

                string script = Path.Combine(_rootDir, "deploy", "run-pocketbase-service.ps1");
                if (!File.Exists(script))
                {
                    throw new FileNotFoundException("No existe runner PowerShell.", script);
                }

                string powershellExe = ResolvePowershellPath();
                string arguments = string.Format(
                    "-NoProfile -ExecutionPolicy Bypass -File \"{0}\" -RootDir \"{1}\"",
                    script,
                    _rootDir
                );

                var psi = new ProcessStartInfo
                {
                    FileName = powershellExe,
                    Arguments = arguments,
                    UseShellExecute = false,
                    CreateNoWindow = true,
                    WorkingDirectory = _rootDir
                };

                var process = new Process
                {
                    StartInfo = psi,
                    EnableRaisingEvents = true
                };
                process.Exited += (_, __) =>
                {
                    try
                    {
                        Log("Proceso hijo termino con codigo " + process.ExitCode + ".");
                    }
                    catch
                    {
                        // ignore
                    }
                };

                if (!process.Start())
                {
                    throw new InvalidOperationException("No se pudo iniciar el runner PowerShell.");
                }

                _child = process;
                Log("Proceso hijo iniciado. PID=" + _child.Id);
            }
        }

        private void StopChildProcess()
        {
            lock (_sync)
            {
                if (_child == null)
                {
                    return;
                }

                try
                {
                    if (!_child.HasExited)
                    {
                        Log("Deteniendo proceso hijo PID=" + _child.Id);
                        KillProcessTree(_child.Id);
                        _child.WaitForExit(10000);
                    }
                }
                catch (Exception ex)
                {
                    Log("Error al detener proceso hijo: " + ex.Message);
                }
                finally
                {
                    try
                    {
                        _child.Dispose();
                    }
                    catch
                    {
                        // ignore
                    }

                    _child = null;
                }
            }
        }

        private static void KillProcessTree(int pid)
        {
            var psi = new ProcessStartInfo
            {
                FileName = "taskkill",
                Arguments = "/PID " + pid + " /T /F",
                UseShellExecute = false,
                CreateNoWindow = true
            };

            using (var p = Process.Start(psi))
            {
                if (p != null)
                {
                    p.WaitForExit(10000);
                }
            }
        }

        private static string ResolvePowershellPath()
        {
            string systemDir = Environment.GetFolderPath(Environment.SpecialFolder.System);
            string candidate = Path.Combine(systemDir, @"WindowsPowerShell\v1.0\powershell.exe");
            return File.Exists(candidate) ? candidate : "powershell.exe";
        }

        private void Log(string message)
        {
            try
            {
                string logDir = Path.GetDirectoryName(_logFile);
                if (!string.IsNullOrWhiteSpace(logDir))
                {
                    Directory.CreateDirectory(logDir);
                }

                string line = string.Format(
                    "[{0}] [{1}] {2}",
                    DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss"),
                    ServiceName,
                    message ?? string.Empty
                );
                File.AppendAllText(_logFile, line + Environment.NewLine, Encoding.UTF8);
            }
            catch
            {
                // ignore logging failures
            }
        }
    }
}
