sap.ui.define([
	"mindtek/warehouse/cockpit/sim/Engine"
], function (Engine) {
	"use strict";

	QUnit.module("Engine");

	QUnit.test("The same seed and the same ticks produce the same warehouse", function (assert) {
		function run() {
			var oEngine = Engine.create({ seed: 20261013, exceptionRate: 0.1 });
			oEngine.tick(90);
			return JSON.stringify(oEngine.getState());
		}
		assert.strictEqual(run(), run());
	});

	QUnit.test("A wave cannot be created without deliveries", function (assert) {
		var oEngine = Engine.create({ exceptionRate: 0 });
		var oPreview = oEngine.previewWave([], "DUE");
		assert.ok(oPreview.hasErrors);
		assert.strictEqual(oPreview.messages[0].key, "msgNoDeliveries");
		assert.throws(function () {
			oEngine.createWave([], "DUE");
		}, /msgNoDeliveries/);
	});

	QUnit.test("Creating and releasing a wave assigns it to pickers", function (assert) {
		var oEngine = Engine.create({ exceptionRate: 0 });
		var aIds = oEngine.getOpenDeliveries().slice(0, 3).map(function (oDelivery) {
			return oDelivery.id;
		});
		var oPreview = oEngine.previewWave(aIds, "ZONE");
		assert.notOk(oPreview.hasErrors);
		assert.ok(oPreview.taskCount > 0);
		assert.ok(oPreview.workersNeeded >= 1);
		assert.ok(oPreview.messages.some(function (oMessage) {
			return oMessage.key === "msgReady" && oMessage.type === "Success";
		}));

		var oWave = oEngine.createWave(aIds, "ZONE");
		assert.strictEqual(oWave.status, "Planned");
		assert.strictEqual(oEngine.getOpenDeliveries().some(function (oDelivery) {
			return aIds.indexOf(oDelivery.id) >= 0;
		}), false);

		var oRelease = oEngine.releaseWave(oWave.id);
		assert.ok(oRelease.workerIds.length >= 1);
		assert.strictEqual(oEngine.get("waves", oWave.id).status, "Released");
		assert.strictEqual(oRelease.taskCount, oWave.taskIds.length);
		assert.throws(function () {
			oEngine.releaseWave(oWave.id);
		}, /errWaveNotPlanned/);
	});

	QUnit.test("Pickers move and the wave can finish", function (assert) {
		var oEngine = Engine.create({ exceptionRate: 0 });
		var aIds = oEngine.getOpenDeliveries().slice(0, 2).map(function (oDelivery) {
			return oDelivery.id;
		});
		var oWave = oEngine.createWave(aIds, "DUE");
		oEngine.releaseWave(oWave.id);
		var sPicker = oEngine.get("waves", oWave.id).workerIds[0];
		var fStart = oEngine.get("workers", sPicker).x;
		oEngine.tick(8);
		assert.notStrictEqual(oEngine.get("workers", sPicker).x, fStart);
		oEngine.tick(4000);
		assert.strictEqual(oEngine.get("waves", oWave.id).status, "Completed");
	});

	QUnit.test("A short pick can be picked from another bin or skipped", function (assert) {
		var oEngine = Engine.create({ exceptionRate: 1 });
		var aOpen = oEngine.getState().exceptions.filter(function (oException) {
			return oException.status === "Open";
		});
		assert.ok(aOpen.length > 0, "warmup raises exceptions");
		var oAlternative = aOpen.filter(function (oException) {
			return oEngine.getAlternativeBins(oException.id).length > 0;
		})[0];
		assert.ok(oAlternative, "one exception has another bin");
		var sBin = oEngine.getAlternativeBins(oAlternative.id)[0].binId;
		var oResult = oEngine.resolveException(oAlternative.id, { action: "alternative", binId: sBin });
		assert.strictEqual(oEngine.get("exceptions", oAlternative.id).status, "Resolved");
		assert.strictEqual(oEngine.get("tasks", oResult.taskId).binId, sBin);

		var oSkip = aOpen.filter(function (oException) {
			return oException.id !== oAlternative.id && oException.status === "Open";
		})[0];
		oEngine.resolveException(oSkip.id, { action: "skip" });
		assert.strictEqual(oEngine.get("exceptions", oSkip.id).resolution, "skip");
		assert.throws(function () {
			oEngine.resolveException(oSkip.id, { action: "skip" });
		}, /errExceptionNotOpen/);
	});

	QUnit.test("Key figures are numbers in range", function (assert) {
		var oKpi = Engine.create().getKpis();
		assert.ok(oKpi.openPicks >= 0);
		assert.ok(oKpi.picksPerHour >= 0);
		assert.ok(oKpi.dockOccupancy >= 0 && oKpi.dockOccupancy <= 100);
		assert.ok(oKpi.lateDeliveries >= 0);
		assert.ok(oKpi.binUtilisation > 0 && oKpi.binUtilisation < 100);
		assert.strictEqual(oKpi.dockCount, 8);
	});
});
