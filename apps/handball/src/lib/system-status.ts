import { request as httpRequest } from "node:http";
import os from "node:os";
import { promises as fs } from "node:fs";

type DockerInfo = {
  Containers?: number;
  ContainersRunning?: number;
  ContainersPaused?: number;
  ContainersStopped?: number;
  NCPU?: number;
  MemTotal?: number;
  OperatingSystem?: string;
  ServerVersion?: string;
};

type DockerContainerSummary = {
  Id: string;
  Names: string[];
  Image: string;
  ImageID?: string;
  State: string;
  Status: string;
};

export type RaspberryPiStatus = {
  collectedAt: Date;
  hostname: string;
  platform: string;
  release: string;
  arch: string;
  uptimeSeconds: number;
  loadAverage: [number, number, number];
  memory: {
    totalBytes: number;
    freeBytes: number;
    availableBytes: number;
  };
  disk: {
    path: string;
    totalBytes: number | null;
    freeBytes: number | null;
    availableBytes: number | null;
    usedBytes: number | null;
    usagePercent: number | null;
    note: string;
  };
  docker: {
    available: boolean;
    serverVersion: string | null;
    operatingSystem: string | null;
    totalContainers: number | null;
    runningContainers: number | null;
    containers: Array<{ name: string; image: string; state: string; status: string }>;
    error: string | null;
  };
};

function bytesToGiB(value: number): string {
  return `${(value / 1024 / 1024 / 1024).toFixed(2)}GiB`;
}

function normalizeFsValue(value: number | bigint): number {
  return typeof value === "bigint" ? Number(value) : value;
}

export function formatUptimeDhms(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const days = Math.floor(seconds / 86_400);
  const hours = Math.floor((seconds % 86_400) / 3_600);
  const minutes = Math.floor((seconds % 3_600) / 60);
  const remainedSeconds = seconds % 60;
  return `${days}d${hours}h${minutes}m${remainedSeconds}s`;
}

export function formatBytes(value: number | null): string {
  if (value === null || !Number.isFinite(value)) {
    return "N/A";
  }

  const units = ["B", "KiB", "MiB", "GiB", "TiB"];
  let size = value;
  let index = 0;
  while (size >= 1024 && index < units.length - 1) {
    size /= 1024;
    index += 1;
  }

  const digits = index <= 1 ? 0 : 2;
  return `${size.toFixed(digits)}${units[index]}`;
}

async function readDockerJson<T>(path: string): Promise<T> {
  return await new Promise<T>((resolve, reject) => {
    const request = httpRequest(
      {
        socketPath: "/var/run/docker.sock",
        path,
        method: "GET",
      },
      (response) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
        response.on("end", () => {
          if (response.statusCode && response.statusCode >= 400) {
            reject(new Error(`Docker API ${path} returned ${response.statusCode}`));
            return;
          }

          try {
            resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")) as T);
          } catch (error) {
            reject(error);
          }
        });
      },
    );

    request.on("error", reject);
    request.end();
  });
}

async function getDiskUsageNote(): Promise<RaspberryPiStatus["disk"]> {
  const mountPath = "/";
  try {
    const stat = await fs.statfs(mountPath, { bigint: true });
    const blockSize = normalizeFsValue(stat.bsize);
    const totalBlocks = normalizeFsValue(stat.blocks);
    const freeBlocks = normalizeFsValue(stat.bfree);
    const availableBlocks = normalizeFsValue(stat.bavail);

    const totalBytes = blockSize * totalBlocks;
    const freeBytes = blockSize * freeBlocks;
    const availableBytes = blockSize * availableBlocks;
    const usedBytes = Math.max(totalBytes - freeBytes, 0);
    const usagePercent = totalBytes > 0 ? Number(((usedBytes / totalBytes) * 100).toFixed(1)) : null;

    return {
      path: mountPath,
      totalBytes,
      freeBytes,
      availableBytes,
      usedBytes,
      usagePercent,
      note: `${mountPath} total=${bytesToGiB(totalBytes)} free=${bytesToGiB(freeBytes)} available=${bytesToGiB(availableBytes)}`,
    };
  } catch {
    return {
      path: mountPath,
      totalBytes: null,
      freeBytes: null,
      availableBytes: null,
      usedBytes: null,
      usagePercent: null,
      note: `${mountPath} のディスク情報を取得できませんでした`,
    };
  }
}

export async function getRaspberryPiStatus(): Promise<RaspberryPiStatus> {
  const collectedAt = new Date();

  const baseStatus: RaspberryPiStatus = {
    collectedAt,
    hostname: os.hostname(),
    platform: os.platform(),
    release: os.release(),
    arch: os.arch(),
    uptimeSeconds: Math.floor(os.uptime()),
    loadAverage: os.loadavg() as [number, number, number],
    memory: {
      totalBytes: os.totalmem(),
      freeBytes: os.freemem(),
      availableBytes: os.freemem(),
    },
    disk: await getDiskUsageNote(),
    docker: {
      available: false,
      serverVersion: null,
      operatingSystem: null,
      totalContainers: null,
      runningContainers: null,
      containers: [],
      error: null,
    },
  };

  try {
    const [info, version, containers] = await Promise.all([
      readDockerJson<DockerInfo>("/info"),
      readDockerJson<{ Version?: string }>("/version"),
      readDockerJson<DockerContainerSummary[]>("/containers/json?all=1"),
    ]);

    baseStatus.docker = {
      available: true,
      serverVersion: version.Version || info.ServerVersion || null,
      operatingSystem: info.OperatingSystem || null,
      totalContainers: typeof info.Containers === "number" ? info.Containers : containers.length,
      runningContainers: typeof info.ContainersRunning === "number"
        ? info.ContainersRunning
        : containers.filter((container) => container.State === "running").length,
      containers: containers
        .slice()
        .sort((left, right) => {
          const leftRunning = left.State === "running" ? 0 : 1;
          const rightRunning = right.State === "running" ? 0 : 1;
          if (leftRunning !== rightRunning) {
            return leftRunning - rightRunning;
          }
          return left.Names[0]?.localeCompare(right.Names[0] || "", "ja") || 0;
        })
        .map((container) => ({
          name: container.Names[0]?.replace(/^\//, "") || container.Id.slice(0, 12),
          image: container.Image,
          state: container.State,
          status: container.Status,
        })),
      error: null,
    };
  } catch (error) {
    baseStatus.docker.error = error instanceof Error ? error.message : "Docker API を取得できませんでした";
  }

  return baseStatus;
}
