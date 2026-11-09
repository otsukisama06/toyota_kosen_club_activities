#!/usr/bin/env python3
"""
Build a Raspberry Pi compatible app image on the main PC, transfer it to the Pi,
and start containers on the Pi without building there.

The default mode streams the image over SSH. Optional registry mode can reduce
transfer size further, but it needs Docker registry trust configuration.

Configuration is loaded from .env.pi file in the project root.
Copy .env.pi.example to .env.pi and set your actual values.

PowerShell example:
  python ./scripts/deploy_prebuilt_image_to_pi.py --pi user@192.168.1.50 --remote-dir /home/user/toyota_kosen_club_activities
"""

from __future__ import annotations

import argparse
import gzip
import os
import shlex
import shutil
import subprocess
import sys
import time
import socket
from pathlib import Path

# Load environment from .env.pi
def load_env_file(env_file: Path) -> dict[str, str]:
  """Load key=value pairs from a .env file."""
  env_vars = {}
  if env_file.exists():
    with open(env_file, "r", encoding="utf-8") as f:
      for line in f:
        line = line.strip()
        if not line or line.startswith("#"):
          continue
        if "=" in line:
          key, value = line.split("=", 1)
          env_vars[key.strip()] = value.strip()
  return env_vars

# Determine project root and load .env.pi
project_root_from_script = Path(__file__).resolve().parents[1]
env_file_path = project_root_from_script / ".env.pi"
env_vars = load_env_file(env_file_path)

# Set defaults from environment or .env.pi
DEFAULT_PI_USER = os.getenv("PI_USER") or env_vars.get("PI_USER", "tsukipi")
DEFAULT_PI_HOST = os.getenv("PI_HOST") or env_vars.get("PI_HOST", "100.87.62.83")
DEFAULT_PI_TARGET = f"{DEFAULT_PI_USER}@{DEFAULT_PI_HOST}"
DEFAULT_REMOTE_DIR = os.getenv("PI_REMOTE_DIR") or env_vars.get("PI_REMOTE_DIR", "~/opt/toyota_kosen_club_activities/")
pi_ssh_key_path_value = os.getenv("PI_SSH_KEY_PATH") or env_vars.get("PI_SSH_KEY_PATH", None)
PI_SSH_KEY_PATH = str(Path(pi_ssh_key_path_value).expanduser()) if pi_ssh_key_path_value else None


def run(cmd: list[str], *, cwd: Path | None = None) -> None:
  cmd_text = " ".join(shlex.quote(part) for part in cmd)
  print(f"\n$ {cmd_text}")
  subprocess.run(cmd, check=True, cwd=str(cwd) if cwd else None)


def run_remote(pi: str, remote_command: str) -> None:
  """Run command on remote Pi via SSH."""
  ssh_cmd = ["ssh"]
  if PI_SSH_KEY_PATH:
    ssh_cmd.extend(["-i", PI_SSH_KEY_PATH])
  ssh_cmd.extend([pi, remote_command])
  run(ssh_cmd)


def run_scp(source: str, dest: str) -> None:
  """Copy files to remote Pi via SCP using SSH key."""
  scp_cmd = ["scp"]
  if PI_SSH_KEY_PATH:
    scp_cmd.extend(["-i", PI_SSH_KEY_PATH])
  scp_cmd.extend([source, dest])
  run(scp_cmd)


def remove_path(path: Path) -> None:
  if not path.exists():
    return

  if path.is_dir():
    shutil.rmtree(path)
  else:
    path.unlink()


def prune_docker_builder_cache() -> None:
  try:
    run(["docker", "builder", "prune", "-af"])
  except subprocess.CalledProcessError as error:
    print(f"\nDocker builder cache cleanup skipped: {error}", file=sys.stderr)


def remove_unused_images() -> None:
  """ビルド前に未使用のDockerイメージを削除してディスク容量を確保
  
  docker system prune -a と同等の効果がありますが、安全に実行します。
  注意: --all フラグを使用することで、タグ付きのイメージも含むすべての未使用イメージを削除します。
  
  PowerShell/コマンドラインから直接実行する場合は:
    docker system prune -a -f --volumes
  を使用してください。
  """
  try:
    print("\n--- Docker cleanup: Removing unused containers, networks and images ---")
    
    # 1. 停止中のコンテナを削除
    run(["docker", "container", "prune", "-f"])
    print("  ✓ Stopped containers removed")
    
    # 2. 未使用のネットワークを削除
    run(["docker", "network", "prune", "-f"])
    print("  ✓ Unused networks removed")
    
    # 3. キャッシュされていない未使用イメージを削除
    run(["docker", "image", "prune", "-f"])
    print("  ✓ Unused images removed (tagged images preserved)")
    
    # 4. ビルダーキャッシュを削除
    run(["docker", "builder", "prune", "-af"])
    print("  ✓ Builder cache removed")
    
    # 注意: docker system prune -a --volumes は、ビルド直後でコンテナ未使用のデプロイ用イメージや
    # 他プロジェクトのボリュームまで削除してしまうため実行しない。
    
    # 6. ディスク容量の確認
    run(["docker", "system", "df"])
    print("--- Docker cleanup completed ---\n")
    
  except subprocess.CalledProcessError as error:
    print(f"\nDocker cleanup skipped: {error}", file=sys.stderr)


def remove_local_image(image_tag: str) -> None:
  try:
    run(["docker", "image", "rm", "-f", image_tag])
  except subprocess.CalledProcessError:
    pass


def wait_for_tcp_port(host: str, port: int, *, timeout_seconds: float = 15.0) -> None:
  deadline = time.monotonic() + timeout_seconds
  while time.monotonic() < deadline:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
      sock.settimeout(1.0)
      try:
        sock.connect((host, port))
        return
      except OSError:
        time.sleep(0.2)

  raise RuntimeError(f"Timed out waiting for {host}:{port} to become available")


def start_ssh_tunnel(pi: str, local_port: int, remote_port: int) -> subprocess.Popen[bytes]:
  ssh_cmd = ["ssh"]
  if PI_SSH_KEY_PATH:
    ssh_cmd.extend(["-i", PI_SSH_KEY_PATH])
  ssh_cmd.extend(
    [
      "-N",
      "-L",
      f"127.0.0.1:{local_port}:127.0.0.1:{remote_port}",
      "-o",
      "ExitOnForwardFailure=yes",
      "-o",
      "ServerAliveInterval=30",
      "-o",
      "ServerAliveCountMax=3",
      pi,
    ]
  )

  print(f"\nOpening SSH tunnel on 127.0.0.1:{local_port} -> {pi}:127.0.0.1:{remote_port}")
  return subprocess.Popen(ssh_cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


def ensure_remote_registry(pi: str, registry_name: str, registry_port: int, registry_volume: str) -> None:
  remote_command = (
    "set -e; "
    f"if docker inspect {shlex.quote(registry_name)} >/dev/null 2>&1; then "
    f"  docker start {shlex.quote(registry_name)} >/dev/null; "
    "else "
    f"  docker volume create {shlex.quote(registry_volume)} >/dev/null; "
    f"  docker run -d --restart=always --name {shlex.quote(registry_name)} "
    f"    -p 127.0.0.1:{registry_port}:5000 "
    f"    -v {shlex.quote(registry_volume)}:/var/lib/registry registry:2 >/dev/null; "
    "fi"
  )
  run_remote(pi, remote_command)


def get_local_image_size_bytes(image_tag: str) -> int | None:
  """Return local Docker image size in bytes, or None if unavailable."""
  inspect_cmd = ["docker", "image", "inspect", image_tag, "--format", "{{.Size}}"]
  try:
    result = subprocess.run(inspect_cmd, check=True, capture_output=True, text=True)
    return int(result.stdout.strip())
  except (subprocess.CalledProcessError, ValueError):
    return None


def stream_image_to_remote(pi: str, image_tag: str) -> None:
  """Stream docker image to remote Pi via SSH using Python gzip (PowerShell-friendly)."""
  print("\nStreaming image to Pi with progress (docker save -> python gzip -> ssh 'gzip -dc | docker load') ...")

  image_size = get_local_image_size_bytes(image_tag)
  save_cmd = ["docker", "image", "save", image_tag]

  ssh_cmd = ["ssh"]
  if PI_SSH_KEY_PATH:
    ssh_cmd.extend(["-i", PI_SSH_KEY_PATH])
  ssh_cmd.extend([pi, "gzip -dc | docker load"])

  save_proc = subprocess.Popen(save_cmd, stdout=subprocess.PIPE)
  ssh_proc = subprocess.Popen(ssh_cmd, stdin=subprocess.PIPE)

  if save_proc.stdout is None or ssh_proc.stdin is None:
    raise RuntimeError("Failed to open streaming pipes.")

  chunk_size = 1024 * 1024
  sent_bytes = 0
  start_time = time.monotonic()
  last_print = 0.0

  try:
    with gzip.GzipFile(fileobj=ssh_proc.stdin, mode="wb", compresslevel=1) as gzip_writer:
      while True:
        chunk = save_proc.stdout.read(chunk_size)
        if not chunk:
          break

        gzip_writer.write(chunk)
        sent_bytes += len(chunk)

        now = time.monotonic()
        if now - last_print >= 0.5:
          elapsed = max(now - start_time, 0.001)
          speed = sent_bytes / elapsed
          if image_size:
            percent = (sent_bytes / image_size) * 100
            progress_text = f"\r  Progress: {percent:6.2f}% ({sent_bytes / 1024 / 1024:8.1f} MB / {image_size / 1024 / 1024:8.1f} MB)  {speed / 1024 / 1024:6.2f} MB/s"
          else:
            progress_text = f"\r  Sent: {sent_bytes / 1024 / 1024:8.1f} MB  {speed / 1024 / 1024:6.2f} MB/s"
          print(progress_text, end="", flush=True)
          last_print = now
  finally:
    save_proc.stdout.close()

  print()

  ssh_return = ssh_proc.wait()
  save_return = save_proc.wait()

  if save_return != 0:
    raise subprocess.CalledProcessError(save_return, save_cmd)
  if ssh_return != 0:
    raise subprocess.CalledProcessError(ssh_return, ssh_cmd)


def write_prebuilt_override(path: Path, service: str, image_tag: str) -> None:
  content = (
    "services:\n"
    f"  {service}:\n"
    f"    image: {image_tag}\n"
    "    build: null\n"
  )
  path.write_text(content, encoding="utf-8")


def ensure_command_exists(command: str) -> None:
  if shutil.which(command) is None:
    raise RuntimeError(f"Required command not found: {command}")


def ensure_docker_daemon_ready() -> None:
  try:
    subprocess.run(["docker", "info"], check=True, capture_output=True, text=True)
  except subprocess.CalledProcessError as error:
    raise RuntimeError(
      "Docker daemon is not reachable. Start Docker Desktop or the Docker service, then run this script again."
    ) from error


def resolve_pi_target(cli_pi: str | None) -> str:
  if cli_pi:
    return cli_pi

  print("\nSSH接続先を選択してください")
  print(f"  1) デフォルトを使う ({DEFAULT_PI_TARGET})")
  print("  2) 接続先を入力する")

  while True:
    choice = input("選択 [1/2] (Enter=1): ").strip()

    if choice == "" or choice == "1":
      return DEFAULT_PI_TARGET

    if choice == "2":
      custom = input("接続先を入力 (IP または user@host): ").strip()
      if not custom:
        print("接続先が空です。もう一度入力してください。")
        continue

      if "@" in custom:
        return custom

      return f"{DEFAULT_PI_USER}@{custom}"

    print("1 か 2 を入力してください。")


def parse_args() -> argparse.Namespace:
  parser = argparse.ArgumentParser(
    description="Build on PC, transfer image to Raspberry Pi, and start containers without Pi build."
  )
  parser.add_argument("--pi", default=None, help=f"SSH target like user@raspberrypi.local (default: {DEFAULT_PI_TARGET})")
  parser.add_argument("--remote-dir", default=DEFAULT_REMOTE_DIR, help=f"Project directory on Raspberry Pi (default: {DEFAULT_REMOTE_DIR})")
  parser.add_argument("--project-root", default=None, help="Local project root (default: repository root)")
  parser.add_argument("--image-tag", default="toyota-kosen-club-activities:prebuilt", help="Tag used for built image")
  parser.add_argument("--platform", default="linux/arm64", help="Target platform for buildx")
  parser.add_argument("--service", default="app", help="Compose service to override with prebuilt image")
  parser.add_argument("--compose-file", default="docker-compose.yml", help="Base compose file name on Pi")
  parser.add_argument("--env-file", default=".env.tunnel", help="Env file name to use on Pi (e.g., .env or .env.tunnel)")
  parser.add_argument("--tunnel-compose-file", default="docker-compose.tunnel.yml", help="Tunnel compose override file (e.g., docker-compose.tunnel.yml)")
  parser.add_argument("--remote-bundle-dir", default="/tmp/toyota-prebuilt", help="Temporary directory on Pi")
  parser.add_argument("--build-arg", action="append", default=["BUILD_NODE_OPTIONS=--max-old-space-size=1024"], help="Extra docker build arg (repeatable)")
  parser.add_argument("--transfer-mode", choices=["registry", "stream"], default="stream", help="How to send the built image to the Pi (default: stream)")
  parser.add_argument("--registry-host", default="127.0.0.1", help="Registry host used in registry mode")
  parser.add_argument("--registry-port", type=int, default=5000, help="Registry port used in registry mode")
  parser.add_argument("--registry-name", default="pi-prebuilt-registry", help="Docker container name for the Pi registry")
  parser.add_argument("--registry-volume", default="pi_prebuilt_registry_data", help="Docker volume name for the Pi registry")
  parser.add_argument("--registry-image-tag", default=None, help="Registry image tag used in registry mode (default: 127.0.0.1:<port>/<image-tag>)")
  parser.add_argument("--with-backup-profile", action="store_true", help="Start compose with backup profile")
  parser.add_argument("--skip-build", action="store_true", help="Skip docker buildx step")
  parser.add_argument("--skip-transfer", action="store_true", help="Skip image stream/transfer step")
  parser.add_argument("--skip-start", action="store_true", help="Skip remote docker compose up step")
  parser.add_argument("--keep-local-bundle", action="store_true", help="Keep local temporary files, build cache, and the built image")
  return parser.parse_args()


def main() -> int:
  args = parse_args()
  pi_target = resolve_pi_target(args.pi)

  for command in ("docker", "ssh", "scp"):
    ensure_command_exists(command)
  ensure_docker_daemon_ready()

  if args.project_root:
    project_root = Path(args.project_root).resolve()
  else:
    project_root = Path(__file__).resolve().parents[1]

  dockerfile = project_root / "Dockerfile"
  if not dockerfile.exists():
    raise RuntimeError(f"Dockerfile not found: {dockerfile}")

  bundle_dir = project_root / ".tmp-prebuilt-deploy"
  bundle_dir.mkdir(parents=True, exist_ok=True)
  cache_dir = bundle_dir / "buildx-cache"
  cache_dir.mkdir(parents=True, exist_ok=True)

  override_file = bundle_dir / "docker-compose.prebuilt.yml"
  registry_image_tag = args.registry_image_tag or f"{args.registry_host}:{args.registry_port}/{args.image_tag}"
  build_image_tag = registry_image_tag if args.transfer_mode == "registry" else args.image_tag

  write_prebuilt_override(override_file, args.service, build_image_tag)

  registry_tunnel_proc: subprocess.Popen[bytes] | None = None

  if not args.skip_build and args.transfer_mode == "registry":
    ensure_remote_registry(pi_target, args.registry_name, args.registry_port, args.registry_volume)
    registry_tunnel_proc = start_ssh_tunnel(pi_target, args.registry_port, args.registry_port)
    wait_for_tcp_port("127.0.0.1", args.registry_port)
    if registry_tunnel_proc.poll() is not None:
      raise RuntimeError("SSH tunnel closed before the registry became available")

  if not args.skip_build:
    build_cmd = ["docker", "buildx", "build", "--platform", args.platform, "-t", build_image_tag, "-f", "Dockerfile"]
    for build_arg in args.build_arg:
      build_cmd.extend(["--build-arg", build_arg])
    build_cmd.extend([
      "--cache-from",
      f"type=local,src={cache_dir}",
      "--cache-to",
      f"type=local,dest={cache_dir},mode=max",
    ])
    if args.transfer_mode == "registry":
      build_cmd.append("--push")
    else:
      build_cmd.append("--load")
    build_cmd.append(".")
    try:
      run(build_cmd, cwd=project_root)
    finally:
      if registry_tunnel_proc is not None:
        registry_tunnel_proc.terminate()
        try:
          registry_tunnel_proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
          registry_tunnel_proc.kill()
        registry_tunnel_proc = None

  # デプロイ前に未使用イメージを削除
  remove_unused_images()

  if not args.keep_local_bundle:
    prune_docker_builder_cache()

  if not args.skip_transfer:
    remote_bundle_quoted = shlex.quote(args.remote_bundle_dir)
    run_remote(pi_target, f"mkdir -p {remote_bundle_quoted}")

    if args.transfer_mode == "stream":
      stream_image_to_remote(pi_target, args.image_tag)
    run_scp(str(override_file), f"{pi_target}:{args.remote_bundle_dir}/")

  if not args.skip_start:
    remote_dir = shlex.quote(args.remote_dir)
    remote_bundle = shlex.quote(args.remote_bundle_dir)
    compose_file = shlex.quote(args.compose_file)
    env_file = shlex.quote(args.env_file)

    # Build compose file arguments
    compose_files = [f"-f {compose_file}"]
    if args.tunnel_compose_file:
      tunnel_compose = shlex.quote(args.tunnel_compose_file)
      compose_files.append(f"-f {tunnel_compose}")
    compose_files.append("-f docker-compose.prebuilt.yml")
    compose_files_segment = " ".join(compose_files)

    # Build env file argument
    env_file_segment = f"--env-file {env_file}" if args.env_file else ""

    profile_segment = "--profile backup " if args.with_backup_profile else ""
    remote_script = (
      "set -e; "
      f"cd {remote_dir}; "
      f"cp {remote_bundle}/docker-compose.prebuilt.yml ./docker-compose.prebuilt.yml; "
      + (f"docker compose {env_file_segment} {compose_files_segment} pull {args.service}; " if args.transfer_mode == "registry" else "")
      + f"docker compose {env_file_segment} {compose_files_segment} {profile_segment}up -d --no-build"
    )
    run_remote(pi_target, remote_script)

  if not args.keep_local_bundle:
    remove_local_image(build_image_tag)
    remove_path(override_file)
    remove_path(bundle_dir)

  print("\nDone.")
  print("If startup failed, check on Pi:")
  print(f"  ssh {pi_target} 'cd {args.remote_dir} && docker compose logs -f {args.service}'")
  if args.transfer_mode == "registry":
    print("Registry mode used; local build cache is cleaned up unless --keep-local-bundle is set.")
  return 0


if __name__ == "__main__":
  try:
    raise SystemExit(main())
  except subprocess.CalledProcessError as error:
    print(f"\nCommand failed with exit code {error.returncode}", file=sys.stderr)
    raise SystemExit(error.returncode)
  except RuntimeError as error:
    print(f"\n{error}", file=sys.stderr)
    raise SystemExit(1)
