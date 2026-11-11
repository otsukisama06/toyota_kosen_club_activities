const { spawn, spawnSync } = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs");
const net = require("node:net");
const path = require("node:path");
const express = require("express");
const cookieParser = require("cookie-parser");
const { createProxyMiddleware } = require("http-proxy-middleware");

const SPORT_COOKIE = "club_sport";
const HAND = "handball";
const TT = "table-tennis";
const HAND_SESSION_COOKIE = "hbn_member_session";
const TT_SESSION_COOKIE = "ttn_member_session";
const LISTEN_PORT = Number(process.env.PORT || 3000);
const FORCE_HTTPS = String(process.env.FORCE_HTTPS || "false").toLowerCase() === "true";
const RUN_DB_MIGRATIONS = String(process.env.RUN_DB_MIGRATIONS || "true").toLowerCase() !== "false";
const HANDBALL_EXTERNAL_PORT = Number(process.env.HANDBALL_EXTERNAL_PORT || process.env.HANDBALL_PORT || 3001);
const TABLE_TENNIS_EXTERNAL_PORT = Number(process.env.TABLE_TENNIS_EXTERNAL_PORT || process.env.TABLE_TENNIS_PORT || 3002);
const POSTGRES_USER = process.env.POSTGRES_USER || "club";
const POSTGRES_PASSWORD = process.env.POSTGRES_PASSWORD || "";
const HANDBALL_LOCAL_DB_URL = `postgresql://${encodeURIComponent(POSTGRES_USER)}:${encodeURIComponent(POSTGRES_PASSWORD)}@postgres:5432/handball_notes?schema=public`;
const TABLE_TENNIS_LOCAL_DB_URL = `postgresql://${encodeURIComponent(POSTGRES_USER)}:${encodeURIComponent(POSTGRES_PASSWORD)}@postgres:5432/table_tennis_notes?schema=public`;
const HANDBALL_INTERNAL_PORT = Number(process.env.HANDBALL_PORT || 3001);
const TABLE_TENNIS_INTERNAL_PORT = Number(process.env.TABLE_TENNIS_PORT || 3002);

const handballTarget = `http://127.0.0.1:${HANDBALL_INTERNAL_PORT}`;
const tableTennisTarget = `http://127.0.0.1:${TABLE_TENNIS_INTERNAL_PORT}`;

const publicBaseUrl = process.env.PUBLIC_BASE_URL || `http://localhost:${LISTEN_PORT}`;
// スーパーアドミンが弓道・卓球アプリを行き来するときの切り替えトークン署名鍵です。未設定なら起動ごとに生成して両アプリへ渡します。
const CLUB_SWITCH_SECRET = String(process.env.CLUB_SWITCH_SECRET || "").trim() || crypto.randomBytes(32).toString("hex");

const app = express();
app.set("trust proxy", true);
app.use(cookieParser());
app.use("/assets/table-tennis", express.static(path.resolve(process.cwd(), "apps/table-tennis/public"), {
	fallthrough: false,
}));

app.use((req, res, next) => {
	res.setHeader("X-Content-Type-Options", "nosniff");
	res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
	res.setHeader("X-Frame-Options", "DENY");
	res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
	if (getRequestProtocol(req) === "https") {
		res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains; preload");
	}

	if (!FORCE_HTTPS) {
		next();
		return;
	}

	const forwardedProto = String(req.headers["x-forwarded-proto"] || "").split(",")[0].trim().toLowerCase();
	if (!forwardedProto || forwardedProto === "https") {
		next();
		return;
	}

	const host = req.headers.host;
	if (!host) {
		next();
		return;
	}

	res.redirect(301, `https://${host}${req.originalUrl}`);
});

const childProcesses = [];
let shuttingDown = false;

function ensureRequiredEnv(name) {
	const value = process.env[name];
	if (!value || !String(value).trim()) {
		throw new Error(`${name} is required`);
	}
	return value;
}

function validateStartupSecrets() {
	if (!POSTGRES_PASSWORD.trim()) {
		throw new Error("POSTGRES_PASSWORD is required");
	}

	ensureRequiredEnv("HANDBALL_ADMIN_VIEW_KEY");
	ensureRequiredEnv("TABLE_TENNIS_ADMIN_VIEW_KEY");
	ensureRequiredEnv("HANDBALL_SUPER_ADMIN_LOGIN_PASSWORD");
	ensureRequiredEnv("TABLE_TENNIS_SUPER_ADMIN_LOGIN_PASSWORD");
}

function sendProxyUnavailable(res) {
	if (res.headersSent) {
		return;
	}

	if (typeof res.status === "function") {
		res.status(503).type("text/plain").send("Upstream app is starting. Please retry in a few seconds.");
		return;
	}

	res.statusCode = 503;
	res.setHeader("Content-Type", "text/plain; charset=utf-8");
	res.end("Upstream app is starting. Please retry in a few seconds.");
}

function getSport(req) {
	const value = req.cookies?.[SPORT_COOKIE];
	if (value === HAND || value === TT) {
		return value;
	}
	return null;
}

function hasSelectedSportSession(req, sport) {
	if (sport === HAND) {
		return Boolean(req.cookies?.[HAND_SESSION_COOKIE]);
	}
	if (sport === TT) {
		return Boolean(req.cookies?.[TT_SESSION_COOKIE]);
	}
	return false;
}

const proxy = createProxyMiddleware({
	changeOrigin: true,
	xfwd: true,
	ws: true,
	proxyTimeout: 60000,
	timeout: 60000,
	on: {
		error: (err, req, res) => {
			console.error("proxy error(on.error):", err?.message || err);
			try {
				sendProxyUnavailable(res);
			} catch (responseError) {
				console.error("failed to send proxy error response(on.error):", responseError);
			}
		},
	},
	onError: (err, req, res) => {
		console.error("proxy error:", err?.message || err);
		try {
			sendProxyUnavailable(res);
		} catch (responseError) {
			console.error("failed to send proxy error response:", responseError);
		}
	},
	router: (req) => {
		const sport = getSport(req);
		return sport === HAND ? handballTarget : tableTennisTarget;
	},
});

function getRequestProtocol(req) {
	const forwardedProto = String(req.headers["x-forwarded-proto"] || "").split(",")[0].trim().toLowerCase();
	if (forwardedProto === "https" || forwardedProto === "http") {
		return forwardedProto;
	}

	if (req.secure) {
		return "https";
	}

	return "http";
}

function getRequestHost(req) {
	const hostHeader = String(req.headers.host || "localhost").trim();
	if (!hostHeader) {
		return "localhost";
	}

	if (hostHeader.startsWith("[")) {
		const endBracket = hostHeader.indexOf("]");
		if (endBracket !== -1) {
			return hostHeader.slice(0, endBracket + 1);
		}
	}

	return hostHeader.split(":")[0] || "localhost";
}

function runOrFail(command, args, env, label) {
	const result = spawnSync(command, args, {
		cwd: process.cwd(),
		env,
		stdio: "inherit",
		shell: false,
	});

	if (result.status !== 0) {
		throw new Error(`${label} failed with exit code ${result.status}`);
	}
}

function runWithStatus(command, args, env) {
	const result = spawnSync(command, args, {
		cwd: process.cwd(),
		env,
		stdio: "inherit",
		shell: false,
	});

	return result.status === 0;
}

function canConnectPostgres(host, port) {
	return new Promise((resolve) => {
		const socket = net.createConnection({ host, port });
		let finished = false;

		const done = (ok) => {
			if (finished) {
				return;
			}
			finished = true;
			socket.destroy();
			resolve(ok);
		};

		socket.once("connect", () => done(true));
		socket.once("error", () => done(false));
		socket.setTimeout(1000, () => done(false));
	});
}

async function waitForPostgres() {
	const maxAttempts = 120;
	const host = "postgres";
	const port = 5432;

	for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
		const ok = await canConnectPostgres(host, port);
		if (ok) {
			console.log("postgres is ready");
			return;
		}

		if (attempt % 10 === 0) {
			console.warn(`waiting for postgres... (${attempt}/${maxAttempts})`);
		}

		await new Promise((resolve) => setTimeout(resolve, 1000));
	}

	throw new Error("postgres did not become ready in time");
}

async function waitForService(host, port, label) {
	const maxAttempts = 120;

	for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
		const ok = await canConnectPostgres(host, port);
		if (ok) {
			console.log(`${label} is ready`);
			return;
		}

		if (attempt % 10 === 0) {
			console.warn(`waiting for ${label}... (${attempt}/${maxAttempts})`);
		}

		await new Promise((resolve) => setTimeout(resolve, 1000));
	}

	throw new Error(`${label} did not become ready in time`);
}

function launchStandaloneApp(label, appDir, port, env) {
	const nestedStandalonePath = `.next/standalone/${appDir.replace(/\\/g, "/")}/server.js`;
	const serverEntry = fs.existsSync(`${appDir}/${nestedStandalonePath}`)
		? nestedStandalonePath
		: ".next/standalone/server.js";

	const child = spawn("node", [serverEntry], {
		cwd: appDir,
		env: {
			...env,
			PORT: String(port),
		},
		stdio: "inherit",
		shell: false,
	});

	child.on("exit", (code, signal) => {
		if (shuttingDown) {
			return;
		}
		// 子アプリが落ちたままにならないよう、ゲートウェイごと終了してコンテナの再起動に任せる。
		console.error(`${label} exited unexpectedly (code=${code}, signal=${signal}); stopping gateway for restart`);
		shutdown(1);
	});

	childProcesses.push(child);
}

function buildAppEnv(
	baseEnv,
	dbUrl,
	peerDbUrl,
	adminKey,
	nodeOptions,
	appBaseUrl,
	superAdminNickname,
	superAdminLoginPassword,
) {
	return {
		...baseEnv,
		DATABASE_URL: dbUrl,
		PEER_DATABASE_URL: peerDbUrl,
		ADMIN_VIEW_KEY: adminKey,
		SUPER_ADMIN_NICKNAME: superAdminNickname,
		SUPER_ADMIN_LOGIN_PASSWORD: superAdminLoginPassword,
		CLUB_SWITCH_SECRET,
		NEXT_PUBLIC_APP_BASE_URL: appBaseUrl,
		NODE_OPTIONS: nodeOptions,
		HOSTNAME: "0.0.0.0",
	};
}

async function startInternalApps() {
	await waitForPostgres();

	const handballEnv = buildAppEnv(
		process.env,
		HANDBALL_LOCAL_DB_URL,
		TABLE_TENNIS_LOCAL_DB_URL,
		ensureRequiredEnv("HANDBALL_ADMIN_VIEW_KEY"),
		process.env.HANDBALL_NODE_OPTIONS || "--max-old-space-size=384",
		process.env.HANDBALL_PUBLIC_BASE_URL || `http://localhost:${HANDBALL_EXTERNAL_PORT}`,
		process.env.HANDBALL_SUPER_ADMIN_NICKNAME || "admin",
		ensureRequiredEnv("HANDBALL_SUPER_ADMIN_LOGIN_PASSWORD"),
	);
	const tableTennisEnv = buildAppEnv(
		process.env,
		TABLE_TENNIS_LOCAL_DB_URL,
		HANDBALL_LOCAL_DB_URL,
		ensureRequiredEnv("TABLE_TENNIS_ADMIN_VIEW_KEY"),
		process.env.TABLE_TENNIS_NODE_OPTIONS || "--max-old-space-size=384",
		process.env.TABLE_TENNIS_PUBLIC_BASE_URL || `http://localhost:${TABLE_TENNIS_EXTERNAL_PORT}`,
		process.env.TABLE_TENNIS_SUPER_ADMIN_NICKNAME || "admin",
		ensureRequiredEnv("TABLE_TENNIS_SUPER_ADMIN_LOGIN_PASSWORD"),
	);

	if (RUN_DB_MIGRATIONS) {
		const handballMigrateOk = runWithStatus("npm", ["--prefix", "apps/handball", "run", "db:migrate:deploy"], handballEnv);
		if (!handballMigrateOk) {
			// データ消失を伴う変更は適用しない（--accept-data-loss なし）。失敗時は起動を中止する。
			console.warn("handball migrate deploy failed; fallback to db:push:safe");
			runOrFail("npm", ["--prefix", "apps/handball", "run", "db:push:safe"], handballEnv, "handball db push");
		}

		const tableTennisMigrateOk = runWithStatus(
			"npm",
			["--prefix", "apps/table-tennis", "run", "db:migrate:deploy"],
			tableTennisEnv,
		);
		if (!tableTennisMigrateOk) {
			console.warn("table-tennis migrate deploy failed; fallback to db:push:safe");
			runOrFail("npm", ["--prefix", "apps/table-tennis", "run", "db:push:safe"], tableTennisEnv, "table-tennis db push");
		}
	} else {
		console.warn("RUN_DB_MIGRATIONS=false: skip prisma migrations");
	}

	launchStandaloneApp("handball", "apps/handball", HANDBALL_INTERNAL_PORT, handballEnv);
	launchStandaloneApp("table-tennis", "apps/table-tennis", TABLE_TENNIS_INTERNAL_PORT, tableTennisEnv);

	await Promise.all([
		waitForService("127.0.0.1", HANDBALL_INTERNAL_PORT, "handball app"),
		waitForService("127.0.0.1", TABLE_TENNIS_INTERNAL_PORT, "table-tennis app"),
	]);
}

app.get("/health", (_req, res) => {
	const allChildrenAlive = childProcesses.length > 0 && childProcesses.every((child) => child.exitCode === null && child.signalCode === null);
	if (!allChildrenAlive) {
		res.status(503).json({ status: "degraded" });
		return;
	}
	res.status(200).json({ status: "ok" });
});

app.get("/", (req, res, next) => {
	const selected = getSport(req);
	if (selected) {
		if (hasSelectedSportSession(req, selected)) {
			// ログイン済みなら選択中アプリへプロキシ。
			// req.url を上書きすると /?month=YYYY-MM のクエリが消えるため保持する。
			proxy(req, res, next);
			return;
		}

		// 未ログイン時はログインページへ誘導
		res.redirect(303, "/auth");
		return;
	}

	const selectedLabel = selected === HAND ? "現在は弓道を選択中" : selected === TT ? "現在は卓球を選択中" : "まだ未選択です";

	res.status(200).type("html").send(`<!doctype html>
<html lang="ja">
<head>
	<meta charset="utf-8" />
	<meta name="viewport" content="width=device-width, initial-scale=1" />
	<title>Toyota Kosen Club Activities</title>
	<style>
		:root { color-scheme: light; }
		body {
			margin: 0;
			font-family: "Yu Gothic", "Hiragino Kaku Gothic ProN", "Meiryo", sans-serif;
			color: #1d1a16;
			background:
				radial-gradient(circle at 15% 0%, #f6ecdc 0%, transparent 38%),
				radial-gradient(circle at 100% 0%, #e7efe0 0%, transparent 42%),
				linear-gradient(160deg, #f8f5ef 0%, #f2eadf 52%, #ede4d6 100%);
		}
		main { min-height: 100vh; display: grid; place-items: center; padding: 28px 16px; }
		.card {
			width: min(560px, 100%);
			background: rgba(255, 251, 245, 0.92);
			border: 1px solid rgba(124, 94, 52, 0.24);
			border-radius: 24px;
			box-shadow: 0 24px 54px rgba(52, 40, 22, 0.16);
			padding: 30px 24px;
		}
		h1 { margin: 0 0 10px; font-size: 1.7rem; letter-spacing: 0.02em; }
		p { margin: 0 0 12px; line-height: 1.7; }
		.status {
			margin: 0 0 20px;
			font-weight: 700;
			color: #7a4b1b;
			background: rgba(247, 224, 189, 0.55);
			padding: 8px 12px;
			border-radius: 10px;
		}
		form { display: grid; gap: 12px; }
		button {
			border: 0;
			border-radius: 14px;
			padding: 13px 14px;
			font-weight: 700;
			font-size: 0.98rem;
			cursor: pointer;
			transition: transform 0.15s ease, box-shadow 0.15s ease, filter 0.15s ease;
		}
		button:hover { transform: translateY(-1px); filter: brightness(1.03); }
		button:active { transform: translateY(0); }
		.sportButton { display: flex; align-items: center; justify-content: center; gap: 10px; }
		.sportLogo { width: 28px; height: 28px; object-fit: contain; }
		.hand {
			background: linear-gradient(135deg, #efe0c3 0%, #d9be90 58%, #c79b5f 100%);
			color: #2d1b0d;
			box-shadow: 0 8px 18px rgba(121, 85, 40, 0.28);
		}
		.tt {
			background: linear-gradient(120deg, #14263b 0%, #1e3853 56%, #2a4d70 100%);
			color: #f5fbff;
			box-shadow: 0 8px 18px rgba(20, 38, 59, 0.26);
		}
		.go {
			background: #2d6a4f;
			color: #fff;
			margin-top: 10px;
			width: 100%;
		}
		@media (max-width: 480px) {
			.card { padding: 24px 18px; border-radius: 18px; }
			h1 { font-size: 1.45rem; }
		}
	</style>
</head>
<body>
	<main>
		<section class="card">
			<h1>部活アプリを選択</h1>
			<p>最初に利用する部活を選択してください。選択後は同じURLで各アプリのログインページへ遷移します。</p>
			<p class="status">${selectedLabel}</p>
			<form action="/select" method="post">
				<button class="hand sportButton" type="submit" name="sport" value="${HAND}">弓道</button>
				<button class="tt sportButton" type="submit" name="sport" value="${TT}"><img class="sportLogo" src="/assets/table-tennis/table-tennis-logo.svg" alt="" aria-hidden="true" />卓球</button>
			</form>
			${selected ? "<form action=\"/auth\" method=\"get\"><button class=\"go\" type=\"submit\">選択中のアプリへ進む</button></form>" : ""}
		</section>
	</main>
</body>
</html>`);
});

app.post("/select", express.urlencoded({ extended: false }), (req, res) => {
	const sport = String(req.body.sport || "");

	if (sport !== HAND && sport !== TT) {
		res.redirect(303, "/");
		return;
	}

	const forwardedProto = String(req.headers["x-forwarded-proto"] || "").split(",")[0].trim().toLowerCase();
	const useSecureCookie = forwardedProto === "https" || req.secure;

	res.cookie(SPORT_COOKIE, sport, {
		httpOnly: true,
		sameSite: "lax",
		secure: useSecureCookie,
		path: "/",
		// Express 4 の maxAge はミリ秒指定です（30日）。
		maxAge: 60 * 60 * 24 * 30 * 1000,
	});

	res.redirect(303, "/auth");
});

// スーパーアドミン用: 表示する部活アプリを切り替え、移動先アプリでトークンを検証してもらいます。
app.get("/switch-app", (req, res) => {
	const to = String(req.query.to || "");
	const token = String(req.query.token || "");
	if ((to !== HAND && to !== TT) || !token) {
		res.redirect(303, "/");
		return;
	}

	const forwardedProto = String(req.headers["x-forwarded-proto"] || "").split(",")[0].trim().toLowerCase();
	res.cookie(SPORT_COOKIE, to, {
		httpOnly: true,
		sameSite: "lax",
		secure: forwardedProto === "https" || req.secure,
		path: "/",
		maxAge: 60 * 60 * 24 * 30 * 1000,
	});
	res.redirect(303, `/api/auth/club-switch?token=${encodeURIComponent(token)}`);
});

app.get("/switch-club", (req, res) => {
	res.clearCookie(SPORT_COOKIE, {
		path: "/",
	});

	res.redirect(303, "/");
});

app.use((req, res, next) => {
	if (
		req.path === "/"
		|| req.path === "/select"
		|| req.path === "/health"
		|| req.path === "/switch-club"
		|| req.path === "/switch-app"
		|| req.path.startsWith("/assets/")
	) {
		next();
		return;
	}

	const selected = getSport(req);
	if (!selected) {
		res.redirect(303, "/");
		return;
	}

	proxy(req, res, next);
});

app.use((err, _req, res, _next) => {
	console.error("gateway middleware error:", err);
	sendProxyUnavailable(res);
});

function shutdown(exitCode = 0) {
	shuttingDown = true;
	for (const child of childProcesses) {
		if (child.exitCode === null && !child.killed) {
			child.kill("SIGTERM");
		}
	}
	process.exit(typeof exitCode === "number" ? exitCode : 0);
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

(async () => {
	try {
		validateStartupSecrets();
		await startInternalApps();

		app.listen(LISTEN_PORT, "0.0.0.0", () => {
			console.log(`gateway listening on ${LISTEN_PORT}`);
		});
	} catch (error) {
		console.error(error);
		process.exit(1);
	}
})();
