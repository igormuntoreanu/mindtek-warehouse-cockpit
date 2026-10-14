"use strict";

const http = require("http");
const { spawn } = require("child_process");
const puppeteer = require("puppeteer");

const PORT = 8096;
const BASE = "http://localhost:" + PORT;

function sleep(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function ready() {
	return new Promise((resolve) => {
		const req = http.get(BASE + "/index.html", (res) => {
			res.resume();
			resolve(res.statusCode === 200);
		});
		req.on("error", () => resolve(false));
		req.setTimeout(2000, () => {
			req.destroy();
			resolve(false);
		});
	});
}

async function waitForServer(child) {
	for (let i = 0; i < 60; i++) {
		if (await ready()) {
			return;
		}
		if (child.exitCode !== null) {
			throw new Error("ui5 serve exited with " + child.exitCode);
		}
		await sleep(1000);
	}
	throw new Error("ui5 serve did not start");
}

async function qunit(browser, url) {
	const page = await browser.newPage();
	const errors = [];
	page.on("pageerror", (err) => errors.push(err.message));
	page.on("console", (msg) => {
		if (msg.type() === "error") {
			errors.push(msg.text());
		}
	});
	await page.goto(url, { waitUntil: "domcontentloaded", timeout: 120000 });
	await page.waitForFunction(() => {
		const banner = document.getElementById("qunit-banner");
		return banner && (banner.classList.contains("qunit-pass") || banner.classList.contains("qunit-fail"));
	}, { timeout: 180000 });
	const result = await page.evaluate(() => {
		const banner = document.getElementById("qunit-banner");
		const failed = [...document.querySelectorAll("#qunit-tests > li.fail")].map((el) => el.innerText.slice(0, 500));
		return {
			pass: banner.classList.contains("qunit-pass"),
			text: (document.getElementById("qunit-testresult") || {}).innerText || "",
			failed: failed
		};
	});
	await page.close();
	result.errors = errors.filter((line) => !/favicon/.test(line));
	return result;
}

async function main() {
	const child = spawn("npx", ["ui5", "serve", "--port", String(PORT)], {
		cwd: require("path").join(__dirname, ".."),
		stdio: ["ignore", "pipe", "pipe"]
	});
	let log = "";
	child.stdout.on("data", (buf) => { log += buf; });
	child.stderr.on("data", (buf) => { log += buf; });
	const browser = await puppeteer.launch({
		headless: true,
		args: ["--no-sandbox", "--disable-dev-shm-usage"],
		defaultViewport: { width: 1440, height: 900 }
	});
	let failed = false;
	try {
		await waitForServer(child);
		for (const url of [
			BASE + "/test/unit/unitTests.qunit.html",
			BASE + "/test/integration/opaTest.qunit.html?wc-paused=true&wc-exceptions=0"
		]) {
			const result = await qunit(browser, url);
			console.log(url);
			console.log(result.text);
			if (!result.pass || /0 tests completed/.test(result.text)) {
				failed = true;
				console.log(result.failed.join("\n"));
				console.log(result.errors.join("\n"));
			}
		}
	} finally {
		const closed = browser.close();
		const stop = sleep(8000).then(() => browser.process() && browser.process().kill("SIGKILL"));
		await Promise.race([closed, stop]);
		child.kill("SIGTERM");
	}
	if (failed) {
		console.error(log.slice(-2000));
		process.exit(1);
	}
	process.exit(0);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
