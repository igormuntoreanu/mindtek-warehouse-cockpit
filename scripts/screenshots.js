"use strict";

const fs = require("fs");
const path = require("path");
const puppeteer = require("puppeteer");

const BASE = process.env.WC_BASE || "http://localhost:8086";
const OUT = process.env.WC_SHOTS || path.join(__dirname, "..", "screenshots");

function sleep(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

async function shot(page, name) {
	const file = path.join(OUT, name);
	await page.screenshot({ path: file });
	console.log(file);
}

async function waitForApp(page) {
	await page.waitForFunction(() => {
		const map = document.querySelector("[id$='floorMap'] svg");
		const clock = document.querySelector("[id$='clock']");
		return map && clock && clock.innerText.indexOf(":") >= 0;
	}, { timeout: 40000 });
	await sleep(500);
}

async function textOf(page, suffix) {
	return page.$eval(`[id$='${suffix}']`, (el) => el.innerText);
}

async function clickSuffix(page, suffix) {
	const sel = `[id$='${suffix}']`;
	await page.waitForSelector(sel, { visible: true, timeout: 15000 });
	await page.click(sel);
}

async function openCockpit(page, viewport, query) {
	await page.setViewport(viewport);
	await page.goto(BASE + "/index.html" + (query || ""), { waitUntil: "domcontentloaded", timeout: 60000 });
	await waitForApp(page);
}

async function main() {
	fs.mkdirSync(OUT, { recursive: true });
	const browser = await puppeteer.launch({
		headless: true,
		args: ["--no-sandbox", "--disable-dev-shm-usage"]
	});
	const page = await browser.newPage();
	try {
		await openCockpit(page, { width: 1440, height: 900 }, "?wc-paused=true");
		await shot(page, "01-cockpit-1440.png");

		await page.setViewport({ width: 1280, height: 800 });
		await sleep(400);
		await shot(page, "02-cockpit-1280.png");
		await openCockpit(page, { width: 1440, height: 900 }, "?wc-paused=true");

		await page.click("[data-key='A1-01-L']");
		await page.waitForFunction(() => location.hash.indexOf("/bin/") >= 0, { timeout: 10000 });
		await sleep(400);
		await shot(page, "05-bin.png");

		await page.click("[data-key='D01']");
		await page.waitForFunction(() => location.hash.indexOf("/dock/") >= 0, { timeout: 10000 });
		await sleep(400);
		await shot(page, "06-dock.png");

		await page.click("[data-key='P01']");
		await page.waitForFunction(() => location.hash.indexOf("/worker/") >= 0, { timeout: 10000 });
		await sleep(400);
		await shot(page, "07-worker.png");

		await page.evaluate(() => {
			sap.ui.core.Component.get("warehouseCockpit").getRouter().navTo("cockpit");
		});
		await page.waitForFunction(() => location.hash.indexOf("/worker/") < 0, { timeout: 10000 });
		await sleep(300);

		await clickSuffix(page, "createWaveButton");
		await page.waitForSelector("[id$='createWaveMessages']", { visible: true });
		await sleep(400);
		const emptyChecks = await textOf(page, "createWaveMessages");
		if (emptyChecks.indexOf("Select at least one delivery.") < 0) {
			throw new Error("Empty wave did not show the validation message: " + emptyChecks);
		}
		await shot(page, "08-create-empty.png");

		const boxes = await page.$$("[id$='createWaveTable-tblBody'] .sapMCb");
		await boxes[0].click();
		await boxes[1].click();
		await sleep(400);
		const preview = await textOf(page, "createWaveMessages");
		if (preview.indexOf("Overdue deliveries") < 0 || preview.indexOf("pick tasks") < 0) {
			throw new Error("Preview checks did not list the overdue and ready messages: " + preview);
		}
		const tasks = await textOf(page, "previewTasks");
		if (!parseInt(tasks, 10)) {
			throw new Error("Preview has no pick tasks");
		}
		await shot(page, "09-create-preview.png");

		await clickSuffix(page, "createWaveConfirm");
		await page.waitForFunction(() => location.hash.indexOf("/wave/W-") >= 0, { timeout: 10000 });
		await page.waitForFunction(() => !document.querySelector("[id$='createWaveDialog']"), { timeout: 10000 });
		await sleep(300);
		await shot(page, "10-planned.png");

		await clickSuffix(page, "releaseWave");
		await page.waitForSelector(".sapMMessageBox", { visible: true });
		await sleep(200);
		await shot(page, "11-confirm.png");
		await page.click(".sapMMessageBox .sapMBtnEmphasized");
		await page.waitForFunction(() => {
			const status = document.querySelector("[id$='waveStatus']");
			return status && status.innerText.indexOf("Released") >= 0;
		}, { timeout: 10000 });
		await sleep(600);
		await shot(page, "12-released.png");

		await page.click("[id$='playbackSwitch'] li:first-child");
		await page.click("[id$='speedSwitch'] li:last-child");
		await page.waitForFunction(() => {
			const clock = document.querySelector("[id$='clock']");
			return clock && clock.innerText.indexOf("09:30:00") < 0;
		}, { timeout: 10000 });
		await sleep(800);
		await shot(page, "13-running.png");

		await clickSuffix(page, "openAsList-button");
		await page.waitForSelector("[id$='objectsTable']", { visible: true });
		await sleep(400);
		await shot(page, "19-list.png");

		await openCockpit(page, { width: 1440, height: 900 }, "?wc-paused=true&wc-exceptions=1");
		const wave = await page.evaluateHandle(() => {
			return [...document.querySelectorAll("[id$='panelList--waveList'] .sapMLIB")]
				.find((el) => el.innerText.indexOf("W-0003") >= 0);
		});
		await wave.click();
		await page.waitForFunction(() => location.hash.indexOf("W-0003") >= 0, { timeout: 10000 });
		await sleep(400);
		await shot(page, "16-exception-wave.png");

		const resolve = await page.evaluateHandle(() => {
			return [...document.querySelectorAll("[id$='waveExceptions'] .sapMBtn")]
				.find((el) => el.offsetParent && el.innerText.indexOf("Resolve") >= 0);
		});
		await resolve.click();
		await page.waitForSelector("[id$='resolveDialog']", { visible: true });
		await sleep(300);
		await shot(page, "17-resolve.png");
		await clickSuffix(page, "resolveConfirm");
		await page.waitForFunction(() => !document.querySelector(".sapMDialog"), { timeout: 10000 });
		await sleep(500);
		await shot(page, "18-resolved.png");

		await openCockpit(page, { width: 390, height: 844, isMobile: true, hasTouch: true }, "?wc-paused=true");
		await sleep(300);
		await shot(page, "14-phone.png");
	} finally {
		await browser.close();
	}
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
