sap.ui.define([
	"./random",
	"./layout",
	"./seedData"
], function (random, layout, seedData) {
	"use strict";

	var SECOND = 1000;
	var MINUTE = 60 * SECOND;
	var HOUR = 60 * MINUTE;

	var DEFAULTS = {
		seed: 20261013,
		startTime: Date.UTC(2026, 9, 13, 9, 26, 0),
		warmupSeconds: 240,
		exceptionRate: 0.1
	};

	/* Durations in simulation seconds, speeds in metres per simulation second. */
	var WALK_SPEED = 1.3;
	var FORKLIFT_SPEED = 2.2;
	var PICK_BASE = 16;
	var PICK_PER_UNIT = 3;
	var CHECK_BIN = 8;
	var DROP = 10;
	var PACK = 50;
	var LOAD = 25;
	var LIFT = 14;
	var MAX_CARRY = 6;
	var TARGET_WAVE_SECONDS = 600;
	var MAX_STEP = 0.5;
	var ESTIMATE_START = { x: 138, y: 77.8 };
	var ESTIMATE_STATION = { x: 127.5, y: 42 };

	var OPEN_TASK = { Open: true, InProgress: true, Exception: true };
	var ACTIVE_WAVE = { Released: true, InProgress: true };
	var DISPATCHED = { Loaded: true, Shipped: true };

	function pad4(iValue) {
		return ("000" + iValue).slice(-4);
	}

	function compareLocation(a, b) {
		if (a.zoneId !== b.zoneId) {
			return a.zoneId < b.zoneId ? -1 : 1;
		}
		if (a.aisleId !== b.aisleId) {
			return a.aisleId < b.aisleId ? -1 : 1;
		}
		if (a.position !== b.position) {
			return a.position - b.position;
		}
		return a.side < b.side ? -1 : (a.side > b.side ? 1 : 0);
	}

	function splitEvenly(aItems, iParts) {
		var aChunks = [];
		for (var i = 0; i < iParts; i++) {
			var iFrom = Math.floor(i * aItems.length / iParts);
			var iTo = Math.floor((i + 1) * aItems.length / iParts);
			aChunks.push(aItems.slice(iFrom, iTo));
		}
		return aChunks;
	}

	function pickSeconds(iQty) {
		return PICK_BASE + PICK_PER_UNIT * iQty;
	}

	/**
	 * Warehouse simulation for HM01. Pure JavaScript without UI5 dependencies,
	 * so it can run in a unit test or in Node.
	 *
	 * Time only moves when {@link #tick} is called. All randomness comes from a
	 * seeded generator, so the same seed and the same sequence of ticks and
	 * actions always produce the same state.
	 *
	 * @param {object} [mOptions] Options
	 * @param {int} [mOptions.seed=20261013] Random seed for data and simulation
	 * @param {int} [mOptions.startTime] Simulation start time in ms (UTC)
	 * @param {number} [mOptions.warmupSeconds=240] Simulation seconds to run before the engine is handed out
	 * @param {number} [mOptions.exceptionRate=0.1] Share of picks that raise a short pick or a blocked bin
	 * @class
	 */
	function Engine(mOptions) {
		var oOptions = Object.assign({}, DEFAULTS, mOptions);
		this._random = random.create(oOptions.seed + 7919);
		this._listeners = {};
		this._events = null;
		this.exceptionRate = oOptions.exceptionRate;
		this.state = seedData.create(oOptions.seed, oOptions.startTime);
		this._buildIndex();
		this._bootstrap();
		if (oOptions.warmupSeconds > 0) {
			this._silent = true;
			this.tick(oOptions.warmupSeconds, 0.25);
			this._silent = false;
		}
	}

	Engine.STRATEGIES = ["DUE", "ZONE", "CUSTOMER"];
	Engine.WALK_SPEED = WALK_SPEED;

	/* ------------------------------------------------------------------ */
	/* Setup                                                                */
	/* ------------------------------------------------------------------ */

	Engine.prototype._buildIndex = function () {
		var oState = this.state;
		var that = this;
		this._index = {};
		["products", "bins", "docks", "stations", "trucks", "workers", "deliveries", "waves", "tasks", "exceptions", "carriers"].forEach(function (sKey) {
			that._index[sKey] = {};
			oState[sKey].forEach(function (oItem) {
				that._index[sKey][oItem.id] = oItem;
			});
		});
		this._binsByProduct = {};
		oState.bins.forEach(function (oBin) {
			(that._binsByProduct[oBin.productId] = that._binsByProduct[oBin.productId] || []).push(oBin);
		});
		oState.docks.forEach(function (oDock) {
			oDock.waiting = oDock.waiting || [];
		});
	};

	Engine.prototype._add = function (sKey, oItem) {
		this.state[sKey].push(oItem);
		this._index[sKey][oItem.id] = oItem;
		return oItem;
	};

	Engine.prototype._bootstrap = function () {
		var aDeliveries = this.state.deliveries;
		var oRunning = this.createWave(aDeliveries.slice(9, 14).map(function (oDelivery) {
			return oDelivery.id;
		}), "DUE");
		this.releaseWave(oRunning.id);
		this.createWave(aDeliveries.slice(14, 17).map(function (oDelivery) {
			return oDelivery.id;
		}), "ZONE");
	};

	/* ------------------------------------------------------------------ */
	/* Events                                                               */
	/* ------------------------------------------------------------------ */

	/**
	 * Registers a listener. Use "*" to receive every event.
	 *
	 * @param {string} sType Event type, e.g. "waveCompleted"
	 * @param {function(object)} fnListener Called with the event object
	 * @returns {this} The engine
	 */
	Engine.prototype.on = function (sType, fnListener) {
		(this._listeners[sType] = this._listeners[sType] || []).push(fnListener);
		return this;
	};

	Engine.prototype.off = function (sType, fnListener) {
		this._listeners[sType] = (this._listeners[sType] || []).filter(function (fnCandidate) {
			return fnCandidate !== fnListener;
		});
		return this;
	};

	Engine.prototype._emit = function (sType, mData) {
		var oEvent = Object.assign({ type: sType, time: this.state.time }, mData);
		if (this._events) {
			this._events.push(oEvent);
		} else {
			this._dispatch([oEvent]);
		}
	};

	Engine.prototype._dispatch = function (aEvents) {
		if (this._silent) {
			return;
		}
		var that = this;
		aEvents.forEach(function (oEvent) {
			(that._listeners[oEvent.type] || []).concat(that._listeners["*"] || []).forEach(function (fnListener) {
				fnListener(oEvent);
			});
		});
	};

	Engine.prototype._log = function (oWave, sType, sKey, aParams) {
		oWave.log.push({ time: this.state.time, type: sType, key: sKey, params: aParams || [] });
	};

	/* ------------------------------------------------------------------ */
	/* Time                                                                 */
	/* ------------------------------------------------------------------ */

	/**
	 * Advances the simulation. Large steps are split into sub-steps so
	 * movement and timers stay consistent at any speed.
	 *
	 * @param {number} fSeconds Simulation seconds to advance
	 * @param {number} [fMaxStep=0.5] Largest sub-step in simulation seconds
	 * @returns {object[]} Events raised during this tick, oldest first
	 */
	Engine.prototype.tick = function (fSeconds, fMaxStep) {
		var fStep = fMaxStep || MAX_STEP;
		var fRemaining = Math.max(0, fSeconds || 0);
		var aEvents = [];
		this._events = aEvents;
		while (fRemaining > 1e-9) {
			var fDelta = Math.min(fStep, fRemaining);
			this._step(fDelta);
			fRemaining -= fDelta;
		}
		this._events = null;
		this._dispatch(aEvents);
		return aEvents;
	};

	Engine.prototype._step = function (fDelta) {
		var oState = this.state;
		var that = this;
		oState.time += Math.round(fDelta * SECOND);
		oState.workers.forEach(function (oWorker) {
			if (oWorker.type === "picker") {
				that._stepPicker(oWorker, fDelta);
			} else {
				that._stepForklift(oWorker, fDelta);
			}
		});
		this._stepStations();
		this._stepDocks();
		var iCutOff = oState.time - HOUR;
		while (oState.pickLog.length && oState.pickLog[0] < iCutOff) {
			oState.pickLog.shift();
		}
	};

	/* ------------------------------------------------------------------ */
	/* Movement                                                             */
	/* ------------------------------------------------------------------ */

	Engine.prototype._setPath = function (oWorker, oTarget) {
		oWorker.path = layout.route(oWorker, oTarget);
		oWorker.pathIndex = 1;
		oWorker.pathVersion += 1;
	};

	Engine.prototype._clearPath = function (oWorker) {
		oWorker.path = [];
		oWorker.pathIndex = 0;
		oWorker.pathVersion += 1;
	};

	/**
	 * Moves a worker along its path.
	 *
	 * @returns {boolean} True when the end of the path is reached
	 */
	Engine.prototype._move = function (oWorker, fDelta) {
		var fDistance = (oWorker.type === "forklift" ? FORKLIFT_SPEED : WALK_SPEED) * fDelta;
		while (fDistance > 0 && oWorker.pathIndex < oWorker.path.length) {
			var oTarget = oWorker.path[oWorker.pathIndex];
			var fDx = oTarget.x - oWorker.x;
			var fDy = oTarget.y - oWorker.y;
			var fLength = Math.sqrt(fDx * fDx + fDy * fDy);
			if (fLength <= fDistance) {
				oWorker.x = oTarget.x;
				oWorker.y = oTarget.y;
				oWorker.pathIndex += 1;
				fDistance -= fLength;
			} else {
				oWorker.x += fDx / fLength * fDistance;
				oWorker.y += fDy / fLength * fDistance;
				fDistance = 0;
			}
		}
		return oWorker.pathIndex >= oWorker.path.length;
	};

	/* ------------------------------------------------------------------ */
	/* Pickers                                                              */
	/* ------------------------------------------------------------------ */

	Engine.prototype._stepPicker = function (oWorker, fDelta) {
		switch (oWorker.phase) {
			case "idle":
				if (oWorker.queue.length) {
					this._startNextTask(oWorker);
				}
				break;
			case "toBin":
				if (this._move(oWorker, fDelta)) {
					this._arriveAtBin(oWorker);
				}
				break;
			case "pick":
				oWorker.timer -= fDelta;
				if (oWorker.timer <= 0) {
					this._finishPick(oWorker);
				}
				break;
			case "toPack":
				if (this._move(oWorker, fDelta)) {
					oWorker.phase = "drop";
					oWorker.status = "dropping";
					oWorker.timer = DROP;
				}
				break;
			case "drop":
				oWorker.timer -= fDelta;
				if (oWorker.timer <= 0) {
					this._dropItems(oWorker);
				}
				break;
			case "toHome":
				if (oWorker.queue.length) {
					this._startNextTask(oWorker);
				} else if (this._move(oWorker, fDelta)) {
					oWorker.phase = "idle";
					oWorker.status = "idle";
					this._clearPath(oWorker);
				}
				break;
			default:
				break;
		}
	};

	Engine.prototype._startNextTask = function (oWorker) {
		while (oWorker.queue.length) {
			var oTask = this._index.tasks[oWorker.queue.shift()];
			if (oTask && oTask.status === "Open") {
				var oWave = this._index.waves[oTask.waveId];
				var oDelivery = this._index.deliveries[oTask.deliveryId];
				var oBin = this._index.bins[oTask.binId];
				oTask.status = "InProgress";
				oTask.workerId = oWorker.id;
				oTask.startedAt = this.state.time;
				oWorker.currentTaskId = oTask.id;
				if (oWave.status === "Released") {
					oWave.status = "InProgress";
					oWave.startedAt = this.state.time;
					this._log(oWave, "Information", "logStarted");
					this._emit("waveStarted", { waveId: oWave.id });
				}
				if (oDelivery.status === "InWave") {
					oDelivery.status = "Picking";
				}
				this._setPath(oWorker, { x: oBin.accessX, y: oBin.accessY });
				oWorker.phase = "toBin";
				oWorker.status = "walking";
				return true;
			}
		}
		if (oWorker.carrying.length) {
			this._goToPack(oWorker);
		} else {
			this._goHome(oWorker);
		}
		return false;
	};

	Engine.prototype._goHome = function (oWorker) {
		oWorker.currentTaskId = null;
		if (Math.abs(oWorker.x - oWorker.homeX) < 0.01 && Math.abs(oWorker.y - oWorker.homeY) < 0.01) {
			oWorker.phase = "idle";
			oWorker.status = "idle";
			this._clearPath(oWorker);
			return;
		}
		this._setPath(oWorker, { x: oWorker.homeX, y: oWorker.homeY });
		oWorker.phase = "toHome";
		oWorker.status = oWorker.type === "forklift" ? "driving" : "walking";
	};

	Engine.prototype._goToPack = function (oWorker) {
		var oTask = this._index.tasks[oWorker.carrying[0].taskId];
		var oStation = this._index.stations[this._index.waves[oTask.waveId].stationId];
		oWorker.dropStationId = oStation.id;
		oWorker.currentTaskId = null;
		this._setPath(oWorker, { x: oStation.accessX, y: oStation.accessY });
		oWorker.phase = "toPack";
		oWorker.status = "walking";
	};

	Engine.prototype._arriveAtBin = function (oWorker) {
		var oTask = this._index.tasks[oWorker.currentTaskId];
		var oBin = this._index.bins[oTask.binId];
		var sType = null;
		var iFound = oTask.qty;
		if (oBin.exception === "blocked") {
			sType = "blocked";
			iFound = 0;
		} else if (this._random.next() < this.exceptionRate) {
			sType = this._random.next() < 0.5 ? "short" : "blocked";
			iFound = sType === "short" ? Math.min(oBin.qty, Math.floor(oTask.qty / 2)) : 0;
		} else if (oBin.qty < oTask.qty) {
			sType = "short";
			iFound = oBin.qty;
		}
		oTask.pickedQty = iFound;
		oWorker.phase = "pick";
		oWorker.status = "picking";
		oWorker.timer = iFound > 0 ? pickSeconds(iFound) : CHECK_BIN;
		this._clearPath(oWorker);
		if (sType) {
			if (sType === "short") {
				oBin.qty = iFound;
			}
			oBin.reserved = Math.max(0, oBin.reserved - oTask.qty);
			oTask.exceptionType = sType;
			oTask.status = "Exception";
			this._raiseException(oTask, oBin, sType, oTask.qty - iFound, oWorker);
		}
	};

	Engine.prototype._raiseException = function (oTask, oBin, sType, iMissing, oWorker) {
		var oState = this.state;
		var oWave = this._index.waves[oTask.waveId];
		oState.seq.exception += 1;
		var oException = this._add("exceptions", {
			id: "E-" + pad4(oState.seq.exception),
			waveId: oTask.waveId,
			taskId: oTask.id,
			deliveryId: oTask.deliveryId,
			lineIndex: oTask.lineIndex,
			productId: oTask.productId,
			binId: oBin.id,
			type: sType,
			missingQty: iMissing,
			workerId: oWorker.id,
			status: "Open",
			raisedAt: oState.time,
			resolvedAt: null,
			resolution: null
		});
		oBin.exception = sType;
		this._log(oWave, "Warning", sType === "short" ? "logShortPick" : "logBlockedBin", [oBin.id, iMissing, oTask.productId]);
		this._emit("exception", { waveId: oWave.id, exceptionId: oException.id, binId: oBin.id, exceptionType: sType });
	};

	Engine.prototype._finishPick = function (oWorker) {
		var oState = this.state;
		var oTask = this._index.tasks[oWorker.currentTaskId];
		var oBin = this._index.bins[oTask.binId];
		if (oTask.pickedQty > 0) {
			oBin.qty = Math.max(0, oBin.qty - oTask.pickedQty);
			oBin.pickCount += 1;
			this._recordMovement(oBin, "pick", -oTask.pickedQty);
			oState.pickLog.push(oState.time);
			oWorker.picksToday += 1;
			oWorker.carrying.push({
				taskId: oTask.id,
				deliveryId: oTask.deliveryId,
				lineIndex: oTask.lineIndex,
				qty: oTask.pickedQty
			});
		}
		if (!oTask.exceptionType) {
			oBin.reserved = Math.max(0, oBin.reserved - oTask.qty);
			oTask.status = "Done";
			oTask.completedAt = oState.time;
		}
		oWorker.currentTaskId = null;
		this._emit("pickCompleted", { waveId: oTask.waveId, taskId: oTask.id, binId: oBin.id, workerId: oWorker.id });
		this._checkDelivery(this._index.deliveries[oTask.deliveryId]);
		this._checkWave(this._index.waves[oTask.waveId]);
		if (oWorker.carrying.length >= MAX_CARRY) {
			this._goToPack(oWorker);
		} else {
			this._startNextTask(oWorker);
		}
	};

	Engine.prototype._recordMovement = function (oBin, sType, iQty) {
		oBin.movements.unshift({ time: this.state.time, type: sType, qty: iQty });
		if (oBin.movements.length > 6) {
			oBin.movements.length = 6;
		}
		oBin.history[oBin.history.length - 1].qty = oBin.qty;
	};

	Engine.prototype._dropItems = function (oWorker) {
		var that = this;
		var oStation = this._index.stations[oWorker.dropStationId];
		var mDeliveries = {};
		var mWaves = {};
		oWorker.carrying.forEach(function (oItem) {
			var oDelivery = that._index.deliveries[oItem.deliveryId];
			var oWave = that._index.waves[that._index.tasks[oItem.taskId].waveId];
			oDelivery.lines[oItem.lineIndex].pickedQty += oItem.qty;
			that._index.stations[oWave.stationId].items += oItem.qty;
			mDeliveries[oDelivery.id] = oDelivery;
			mWaves[oWave.id] = true;
		});
		oWorker.carrying = [];
		this._emit("itemsDropped", { workerId: oWorker.id, stationId: oStation.id });
		Object.keys(mDeliveries).forEach(function (sId) {
			that._checkDelivery(mDeliveries[sId]);
		});
		Object.keys(mWaves).forEach(function (sId) {
			that._checkWave(that._index.waves[sId]);
		});
		this._startNextTask(oWorker);
	};

	Engine.prototype._isCarried = function (fnMatch) {
		return this.state.workers.some(function (oWorker) {
			return oWorker.carrying.some(fnMatch);
		});
	};

	Engine.prototype._checkDelivery = function (oDelivery) {
		if (oDelivery.status !== "Picking" && oDelivery.status !== "InWave") {
			return;
		}
		var that = this;
		var bLinesDone = oDelivery.lines.every(function (oLine) {
			return oLine.pickedQty + oLine.shortQty >= oLine.qty;
		});
		var bTasksOpen = this.state.tasks.some(function (oTask) {
			return oTask.deliveryId === oDelivery.id && oTask.waveId === oDelivery.waveId && OPEN_TASK[oTask.status];
		});
		var bCarried = this._isCarried(function (oItem) {
			return oItem.deliveryId === oDelivery.id;
		});
		if (!bLinesDone || bTasksOpen || bCarried) {
			return;
		}
		var oWave = this._index.waves[oDelivery.waveId];
		var oStation = this._index.stations[oWave.stationId];
		oDelivery.status = "Picked";
		oDelivery.stationId = oStation.id;
		oStation.queue.push({ deliveryId: oDelivery.id, readyAt: this.state.time + PACK * SECOND });
		that._emit("deliveryPicked", { deliveryId: oDelivery.id, waveId: oWave.id });
	};

	Engine.prototype._checkWave = function (oWave) {
		if (!ACTIVE_WAVE[oWave.status]) {
			return;
		}
		var that = this;
		var bDone = oWave.taskIds.every(function (sId) {
			return that._index.tasks[sId].status === "Done";
		});
		var bCarried = this._isCarried(function (oItem) {
			return that._index.tasks[oItem.taskId].waveId === oWave.id;
		}) || this.state.workers.some(function (oWorker) {
			return oWorker.currentTaskId && that._index.tasks[oWorker.currentTaskId].waveId === oWave.id;
		});
		if (!bDone || bCarried) {
			return;
		}
		var iSkipped = this.state.exceptions.filter(function (oException) {
			return oException.waveId === oWave.id && oException.resolution === "skip";
		}).length;
		oWave.status = "Completed";
		oWave.completedAt = this.state.time;
		this._log(oWave, "Success", iSkipped ? "logCompletedShort" : "logCompleted", [iSkipped]);
		this._emit("waveCompleted", { waveId: oWave.id, skipped: iSkipped });
	};

	/* ------------------------------------------------------------------ */
	/* Forklifts                                                            */
	/* ------------------------------------------------------------------ */

	Engine.prototype._findPallet = function () {
		var aDocks = this.state.docks;
		for (var i = 0; i < aDocks.length; i++) {
			var oDock = aDocks[i];
			var oTruck = oDock.direction === "inbound" && oDock.truckId && this._index.trucks[oDock.truckId];
			if (oTruck) {
				for (var j = 0; j < oTruck.pallets.length; j++) {
					if (!oTruck.pallets[j].claimed) {
						return { dockId: oDock.id, truckId: oTruck.id, palletIndex: j };
					}
				}
			}
		}
		return null;
	};

	Engine.prototype._startForkliftJob = function (oWorker, oJob) {
		var oDock = this._index.docks[oJob.dockId];
		this._index.trucks[oJob.truckId].pallets[oJob.palletIndex].claimed = true;
		oWorker.job = oJob;
		this._setPath(oWorker, { x: oDock.accessX, y: oDock.accessY });
		oWorker.phase = "toDock";
		oWorker.status = "driving";
	};

	Engine.prototype._stepForklift = function (oWorker, fDelta) {
		var oJob;
		switch (oWorker.phase) {
			case "idle":
			case "toHome":
				oJob = this._findPallet();
				if (oJob) {
					this._startForkliftJob(oWorker, oJob);
				} else if (oWorker.phase === "idle") {
					if (Math.abs(oWorker.x - oWorker.homeX) > 0.01 || Math.abs(oWorker.y - oWorker.homeY) > 0.01) {
						this._goHome(oWorker);
					}
				} else if (this._move(oWorker, fDelta)) {
					oWorker.phase = "idle";
					oWorker.status = "idle";
					this._clearPath(oWorker);
				}
				break;
			case "toDock":
				if (this._move(oWorker, fDelta)) {
					oWorker.phase = "liftDock";
					oWorker.status = "lifting";
					oWorker.timer = LIFT;
					this._clearPath(oWorker);
				}
				break;
			case "liftDock":
				oWorker.timer -= fDelta;
				if (oWorker.timer <= 0) {
					this._takePallet(oWorker);
				}
				break;
			case "toBinPut":
				if (this._move(oWorker, fDelta)) {
					oWorker.phase = "put";
					oWorker.status = "lifting";
					oWorker.timer = LIFT;
					this._clearPath(oWorker);
				}
				break;
			case "put":
				oWorker.timer -= fDelta;
				if (oWorker.timer <= 0) {
					this._putAway(oWorker);
				}
				break;
			default:
				break;
		}
	};

	Engine.prototype._takePallet = function (oWorker) {
		var oJob = oWorker.job;
		var oTruck = this._index.trucks[oJob.truckId];
		var oPallet = oTruck.pallets[oJob.palletIndex];
		oTruck.load = Math.max(0, oTruck.load - 1);
		var aBins = (this._binsByProduct[oPallet.productId] || []).filter(function (oBin) {
			return !oBin.exception && oBin.qty < oBin.capacity;
		}).sort(function (a, b) {
			return a.qty / a.capacity - b.qty / b.capacity || compareLocation(a, b);
		});
		if (!aBins.length) {
			oPallet.done = true;
			oWorker.job = null;
			oWorker.phase = "idle";
			oWorker.status = "idle";
			return;
		}
		oJob.binId = aBins[0].id;
		this._setPath(oWorker, { x: aBins[0].accessX, y: aBins[0].accessY });
		oWorker.phase = "toBinPut";
		oWorker.status = "driving";
	};

	Engine.prototype._putAway = function (oWorker) {
		var oJob = oWorker.job;
		var oPallet = this._index.trucks[oJob.truckId] ? this._index.trucks[oJob.truckId].pallets[oJob.palletIndex] : oJob.pallet;
		var oBin = this._index.bins[oJob.binId];
		var iQty = Math.min(oPallet.qty, oBin.capacity - oBin.qty);
		if (iQty > 0 && !oBin.exception) {
			oBin.qty += iQty;
			this._recordMovement(oBin, "putaway", iQty);
		}
		oPallet.done = true;
		oWorker.putawaysToday += 1;
		oWorker.job = null;
		oWorker.phase = "idle";
		oWorker.status = "idle";
		this._emit("putAway", { workerId: oWorker.id, binId: oBin.id, qty: iQty });
	};

	/* ------------------------------------------------------------------ */
	/* Packing and docks                                                    */
	/* ------------------------------------------------------------------ */

	Engine.prototype._deliveryUnits = function (oDelivery) {
		return oDelivery.lines.reduce(function (iSum, oLine) {
			return iSum + oLine.pickedQty;
		}, 0);
	};

	Engine.prototype._stepStations = function () {
		var that = this;
		var iNow = this.state.time;
		this.state.stations.forEach(function (oStation) {
			while (oStation.queue.length && oStation.queue[0].readyAt <= iNow) {
				var oDelivery = that._index.deliveries[oStation.queue.shift().deliveryId];
				oDelivery.status = "Packed";
				oDelivery.packedAt = iNow;
				oStation.items = Math.max(0, oStation.items - that._deliveryUnits(oDelivery));
				var oCarrier = that._index.carriers[oDelivery.carrierId];
				that._index.docks[oCarrier.dockId].waiting.push(oDelivery.id);
				that._emit("deliveryPacked", { deliveryId: oDelivery.id });
			}
		});
	};

	Engine.prototype._stepDocks = function () {
		var that = this;
		var oState = this.state;
		oState.docks.forEach(function (oDock) {
			var oTruck = oDock.truckId ? that._index.trucks[oDock.truckId] : null;
			if (!oTruck && oDock.nextArrival !== null && oState.time >= oDock.nextArrival) {
				oTruck = seedData.createTruck(that._random, oState, oDock, oState.time);
				that._index.trucks[oTruck.id] = oTruck;
				that._emit("truckArrived", { dockId: oDock.id, truckId: oTruck.id });
			}
			var bBusy = false;
			if (oTruck && oDock.direction === "outbound") {
				if (oDock.loading && oState.time >= oDock.loading.until) {
					var oDelivery = that._index.deliveries[oDock.loading.deliveryId];
					oDelivery.status = "Loaded";
					oDelivery.truckId = oTruck.id;
					oDelivery.loadedAt = oState.time;
					oTruck.load = Math.min(oTruck.capacity, oTruck.load + that._deliveryUnits(oDelivery));
					oTruck.deliveryIds.push(oDelivery.id);
					oDock.loading = null;
					that._emit("deliveryLoaded", { deliveryId: oDelivery.id, dockId: oDock.id });
				}
				if (!oDock.loading && oDock.waiting.length && oTruck.load < oTruck.capacity) {
					oDock.loading = { deliveryId: oDock.waiting.shift(), until: oState.time + LOAD * SECOND };
				}
				bBusy = !!oDock.loading;
				if (!bBusy && (oState.time >= oTruck.etd || oTruck.load >= oTruck.capacity)) {
					that._departTruck(oDock, oTruck);
					oTruck = null;
				}
			} else if (oTruck) {
				bBusy = that._isLiftingAt(oDock.id);
				var bEmpty = oTruck.pallets.every(function (oPallet) {
					return oPallet.claimed;
				});
				if (bEmpty && !bBusy) {
					that._departTruck(oDock, oTruck);
					oTruck = null;
				}
			}
			oDock.state = !oTruck ? "free" : (bBusy ? "loading" : "occupied");
		});
	};

	Engine.prototype._isLiftingAt = function (sDockId) {
		return this.state.workers.some(function (oWorker) {
			return oWorker.job && oWorker.job.dockId === sDockId && (oWorker.phase === "toDock" || oWorker.phase === "liftDock");
		});
	};

	Engine.prototype._departTruck = function (oDock, oTruck) {
		var that = this;
		var oState = this.state;
		oTruck.deliveryIds.forEach(function (sId) {
			that._index.deliveries[sId].status = "Shipped";
		});
		oState.workers.forEach(function (oWorker) {
			if (oWorker.job && oWorker.job.truckId === oTruck.id) {
				oWorker.job.pallet = oTruck.pallets[oWorker.job.palletIndex];
			}
		});
		oState.trucks.splice(oState.trucks.indexOf(oTruck), 1);
		delete this._index.trucks[oTruck.id];
		oDock.truckId = null;
		oDock.loading = null;
		oDock.nextArrival = oState.time + (oDock.direction === "outbound" ? this._random.int(8, 15) : this._random.int(14, 28)) * MINUTE;
		this._emit("truckDeparted", { dockId: oDock.id, truckId: oTruck.id });
	};

	/* ------------------------------------------------------------------ */
	/* Waves                                                                */
	/* ------------------------------------------------------------------ */

	Engine.prototype._idlePickers = function () {
		return this.state.workers.filter(function (oWorker) {
			return oWorker.type === "picker" && !oWorker.queue.length && !oWorker.carrying.length &&
				(oWorker.phase === "idle" || oWorker.phase === "toHome");
		});
	};

	Engine.prototype._estimateChunk = function (aTasks) {
		var that = this;
		var oPosition = ESTIMATE_START;
		var fDistance = 0;
		var fWork = 0;
		var iCarried = 0;
		aTasks.forEach(function (oTask) {
			var oBin = that._index.bins[oTask.binId];
			var oAccess = { x: oBin.accessX, y: oBin.accessY };
			fDistance += layout.pathLength(layout.route(oPosition, oAccess));
			fWork += pickSeconds(oTask.qty);
			oPosition = oAccess;
			iCarried += 1;
			if (iCarried >= MAX_CARRY) {
				fDistance += layout.pathLength(layout.route(oPosition, ESTIMATE_STATION));
				fWork += DROP;
				oPosition = ESTIMATE_STATION;
				iCarried = 0;
			}
		});
		if (iCarried) {
			fDistance += layout.pathLength(layout.route(oPosition, ESTIMATE_STATION));
			fWork += DROP;
		}
		return fDistance / WALK_SPEED + fWork;
	};

	Engine.prototype._estimate = function (aTasks) {
		var that = this;
		var iMax = Math.min(8, aTasks.length);
		var fSeconds = 0;
		for (var n = 1; n <= iMax; n++) {
			fSeconds = Math.max.apply(null, splitEvenly(aTasks, n).map(function (aChunk) {
				return that._estimateChunk(aChunk);
			}));
			if (fSeconds <= TARGET_WAVE_SECONDS || n === iMax) {
				return { workersNeeded: n, estimatedSeconds: Math.round(fSeconds) };
			}
		}
		return { workersNeeded: 0, estimatedSeconds: 0 };
	};

	Engine.prototype._sortTasks = function (aTasks, sStrategy) {
		var that = this;
		return aTasks.sort(function (a, b) {
			var oBinA = that._index.bins[a.binId];
			var oBinB = that._index.bins[b.binId];
			if (sStrategy === "ZONE") {
				return compareLocation(oBinA, oBinB) || a.dueTime - b.dueTime;
			}
			if (sStrategy === "CUSTOMER") {
				if (a.customer !== b.customer) {
					return a.customer < b.customer ? -1 : 1;
				}
				if (a.deliveryId !== b.deliveryId) {
					return a.deliveryId < b.deliveryId ? -1 : 1;
				}
				return compareLocation(oBinA, oBinB);
			}
			return a.dueTime - b.dueTime || (a.deliveryId < b.deliveryId ? -1 : (a.deliveryId > b.deliveryId ? 1 : 0)) || compareLocation(oBinA, oBinB);
		});
	};

	/**
	 * Plans a wave without changing the state.
	 *
	 * Messages carry an i18n key and parameters instead of text, so the
	 * engine stays language-independent.
	 *
	 * @param {string[]} aDeliveryIds Open deliveries to include
	 * @param {string} sStrategy "DUE", "ZONE" or "CUSTOMER"
	 * @returns {{tasks: object[], taskCount: int, unitCount: int, workersNeeded: int,
	 *   estimatedSeconds: int, idlePickers: int, messages: object[], hasErrors: boolean}} Preview
	 */
	Engine.prototype.previewWave = function (aDeliveryIds, sStrategy) {
		var that = this;
		var oState = this.state;
		var aMessages = [];
		var aDeliveries = (aDeliveryIds || []).map(function (sId) {
			return that._index.deliveries[sId];
		}).filter(function (oDelivery) {
			return oDelivery && oDelivery.status === "Open";
		});
		var iIdle = this._idlePickers().length;
		var oPreview = {
			tasks: [],
			taskCount: 0,
			unitCount: 0,
			deliveryCount: aDeliveries.length,
			workersNeeded: 0,
			estimatedSeconds: 0,
			idlePickers: iIdle,
			messages: aMessages,
			hasErrors: false
		};
		if (Engine.STRATEGIES.indexOf(sStrategy) < 0) {
			aMessages.push({ type: "Error", key: "msgUnknownStrategy", params: [sStrategy] });
		}
		if (!aDeliveries.length) {
			aMessages.push({ type: "Error", key: "msgNoDeliveries", params: [] });
		}
		if (aMessages.length) {
			oPreview.hasErrors = true;
			return oPreview;
		}
		var mAvailable = {};
		oState.bins.forEach(function (oBin) {
			mAvailable[oBin.id] = oBin.exception ? 0 : Math.max(0, oBin.qty - oBin.reserved);
		});
		aDeliveries.forEach(function (oDelivery) {
			oDelivery.lines.forEach(function (oLine, iLine) {
				var iRemaining = oLine.qty;
				var aBins = (that._binsByProduct[oLine.productId] || []).slice().sort(function (a, b) {
					return mAvailable[b.id] - mAvailable[a.id] || compareLocation(a, b);
				});
				aBins.forEach(function (oBin) {
					var iTake = Math.min(iRemaining, mAvailable[oBin.id]);
					if (iTake > 0) {
						oPreview.tasks.push({
							deliveryId: oDelivery.id,
							lineIndex: iLine,
							productId: oLine.productId,
							binId: oBin.id,
							qty: iTake,
							dueTime: oDelivery.dueTime,
							customer: oDelivery.customer
						});
						mAvailable[oBin.id] -= iTake;
						iRemaining -= iTake;
					}
				});
				if (iRemaining > 0) {
					aMessages.push({
						type: "Warning",
						key: "msgShortStock",
						params: [oDelivery.id, oLine.productId, oLine.qty - iRemaining, oLine.qty],
						deliveryId: oDelivery.id
					});
				}
			});
		});
		if (!oPreview.tasks.length) {
			aMessages.unshift({ type: "Error", key: "msgNoStock", params: [] });
			oPreview.hasErrors = true;
			return oPreview;
		}
		this._sortTasks(oPreview.tasks, sStrategy);
		var oEstimate = this._estimate(oPreview.tasks);
		oPreview.taskCount = oPreview.tasks.length;
		oPreview.unitCount = oPreview.tasks.reduce(function (iSum, oTask) {
			return iSum + oTask.qty;
		}, 0);
		oPreview.workersNeeded = oEstimate.workersNeeded;
		oPreview.estimatedSeconds = oEstimate.estimatedSeconds;
		var iOverdue = aDeliveries.filter(function (oDelivery) {
			return oDelivery.dueTime < oState.time;
		}).length;
		if (iOverdue) {
			aMessages.push({ type: "Information", key: "msgOverdue", params: [iOverdue] });
		}
		if (iIdle < oEstimate.workersNeeded) {
			aMessages.push({ type: "Warning", key: "msgFewPickers", params: [iIdle, oEstimate.workersNeeded] });
		}
		aMessages.push({ type: "Success", key: "msgReady", params: [oPreview.taskCount, aDeliveries.length] });
		return oPreview;
	};

	/**
	 * Creates a planned wave and reserves its stock.
	 *
	 * @param {string[]} aDeliveryIds Open deliveries
	 * @param {string} sStrategy "DUE", "ZONE" or "CUSTOMER"
	 * @returns {object} The new wave
	 * @throws {Error} If the preview has errors; the message is the i18n key
	 */
	Engine.prototype.createWave = function (aDeliveryIds, sStrategy) {
		var that = this;
		var oState = this.state;
		var oPreview = this.previewWave(aDeliveryIds, sStrategy);
		if (oPreview.hasErrors) {
			var oError = oPreview.messages.filter(function (oMessage) {
				return oMessage.type === "Error";
			})[0];
			throw new Error(oError.key);
		}
		oState.seq.wave += 1;
		var sWaveId = "W-" + pad4(oState.seq.wave);
		var aTaskIds = oPreview.tasks.map(function (oPlanned) {
			oState.seq.task += 1;
			var oTask = that._add("tasks", {
				id: "T-" + oState.seq.task,
				waveId: sWaveId,
				deliveryId: oPlanned.deliveryId,
				lineIndex: oPlanned.lineIndex,
				productId: oPlanned.productId,
				binId: oPlanned.binId,
				qty: oPlanned.qty,
				pickedQty: 0,
				status: "Open",
				workerId: null,
				startedAt: null,
				completedAt: null,
				exceptionType: null,
				resolution: null
			});
			that._index.bins[oTask.binId].reserved += oTask.qty;
			return oTask.id;
		});
		var aDeliveryIdsInWave = [];
		oPreview.tasks.forEach(function (oPlanned) {
			if (aDeliveryIdsInWave.indexOf(oPlanned.deliveryId) < 0) {
				aDeliveryIdsInWave.push(oPlanned.deliveryId);
			}
		});
		aDeliveryIds.forEach(function (sId) {
			var oDelivery = that._index.deliveries[sId];
			if (!oDelivery || oDelivery.status !== "Open") {
				return;
			}
			if (aDeliveryIdsInWave.indexOf(sId) < 0) {
				aDeliveryIdsInWave.push(sId);
			}
			oDelivery.lines.forEach(function (oLine, iLine) {
				oLine.plannedQty = oPreview.tasks.filter(function (oPlanned) {
					return oPlanned.deliveryId === sId && oPlanned.lineIndex === iLine;
				}).reduce(function (iSum, oPlanned) {
					return iSum + oPlanned.qty;
				}, 0);
				oLine.shortQty = oLine.qty - oLine.plannedQty;
			});
			oDelivery.status = "InWave";
			oDelivery.waveId = sWaveId;
		});
		var oWave = this._add("waves", {
			id: sWaveId,
			status: "Planned",
			strategy: sStrategy,
			deliveryIds: aDeliveryIdsInWave,
			taskIds: aTaskIds,
			stationId: null,
			workerIds: [],
			workersNeeded: oPreview.workersNeeded,
			estimatedSeconds: oPreview.estimatedSeconds,
			createdAt: oState.time,
			releasedAt: null,
			startedAt: null,
			completedAt: null,
			log: []
		});
		this._log(oWave, "Information", "logCreated", [aDeliveryIdsInWave.length, aTaskIds.length]);
		this._emit("waveCreated", { waveId: sWaveId });
		return oWave;
	};

	/**
	 * Releases a planned wave and hands its pick tasks to pickers. Idle pickers
	 * come first; if there are not enough, the least busy pickers get the rest
	 * in their queue.
	 *
	 * @param {string} sWaveId Planned wave
	 * @returns {{waveId: string, taskCount: int, workerIds: string[]}} Assignment
	 * @throws {Error} "errWaveNotPlanned" if the wave is not planned
	 */
	Engine.prototype.releaseWave = function (sWaveId) {
		var that = this;
		var oState = this.state;
		var oWave = this._index.waves[sWaveId];
		if (!oWave || oWave.status !== "Planned") {
			throw new Error("errWaveNotPlanned");
		}
		var aTasks = oWave.taskIds.map(function (sId) {
			return that._index.tasks[sId];
		}).filter(function (oTask) {
			return oTask.status === "Open";
		});
		var iWorkers = Math.max(1, Math.min(oWave.workersNeeded || 1, aTasks.length));
		var aChosen = this._idlePickers().slice(0, iWorkers);
		if (aChosen.length < iWorkers) {
			var aBusy = oState.workers.filter(function (oWorker) {
				return oWorker.type === "picker" && aChosen.indexOf(oWorker) < 0;
			}).sort(function (a, b) {
				return a.queue.length - b.queue.length || (a.id < b.id ? -1 : 1);
			});
			aChosen = aChosen.concat(aBusy.slice(0, iWorkers - aChosen.length));
		}
		splitEvenly(aTasks, aChosen.length).forEach(function (aChunk, i) {
			aChunk.forEach(function (oTask) {
				oTask.workerId = aChosen[i].id;
				aChosen[i].queue.push(oTask.id);
			});
		});
		var iWaveNo = parseInt(sWaveId.slice(2), 10);
		oWave.stationId = oState.stations[(iWaveNo - 1) % oState.stations.length].id;
		oWave.workerIds = aChosen.map(function (oWorker) {
			return oWorker.id;
		});
		oWave.status = "Released";
		oWave.releasedAt = oState.time;
		this._log(oWave, "Information", "logReleased", [aTasks.length, aChosen.length]);
		this._emit("waveReleased", { waveId: sWaveId, taskCount: aTasks.length, workerIds: oWave.workerIds });
		return { waveId: sWaveId, taskCount: aTasks.length, workerIds: oWave.workerIds };
	};

	/* ------------------------------------------------------------------ */
	/* Exceptions                                                           */
	/* ------------------------------------------------------------------ */

	/**
	 * Bins that can replace the bin of an open exception.
	 *
	 * @param {string} sExceptionId Exception
	 * @returns {Array<{binId: string, available: int}>} Candidates, most stock first
	 */
	Engine.prototype.getAlternativeBins = function (sExceptionId) {
		var oException = this._index.exceptions[sExceptionId];
		if (!oException) {
			return [];
		}
		return (this._binsByProduct[oException.productId] || []).filter(function (oBin) {
			return oBin.id !== oException.binId && !oBin.exception && oBin.qty - oBin.reserved > 0;
		}).map(function (oBin) {
			return { binId: oBin.id, available: oBin.qty - oBin.reserved };
		}).sort(function (a, b) {
			return b.available - a.available;
		});
	};

	/**
	 * Resolves an open exception.
	 *
	 * @param {string} sExceptionId Open exception
	 * @param {{action: string, binId: string}} oResolution action "alternative" (with binId) or "skip"
	 * @returns {{taskId: string|null, workerId: string|null, qty: int}} The replacement task, if any
	 * @throws {Error} "errExceptionNotOpen" or "errNoAlternative"
	 */
	Engine.prototype.resolveException = function (sExceptionId, oResolution) {
		var oState = this.state;
		var oException = this._index.exceptions[sExceptionId];
		if (!oException || oException.status !== "Open") {
			throw new Error("errExceptionNotOpen");
		}
		var oTask = this._index.tasks[oException.taskId];
		var oWave = this._index.waves[oException.waveId];
		var oDelivery = this._index.deliveries[oException.deliveryId];
		var oLine = oDelivery.lines[oException.lineIndex];
		var oResult = { taskId: null, workerId: null, qty: 0 };
		if (oResolution && oResolution.action === "alternative") {
			var oBin = this._index.bins[oResolution.binId];
			var iAvailable = oBin && !oBin.exception && oBin.productId === oException.productId ? oBin.qty - oBin.reserved : 0;
			if (iAvailable <= 0) {
				throw new Error("errNoAlternative");
			}
			var iQty = Math.min(oException.missingQty, iAvailable);
			oState.seq.task += 1;
			var oNewTask = this._add("tasks", {
				id: "T-" + oState.seq.task,
				waveId: oWave.id,
				deliveryId: oDelivery.id,
				lineIndex: oException.lineIndex,
				productId: oException.productId,
				binId: oBin.id,
				qty: iQty,
				pickedQty: 0,
				status: "Open",
				workerId: null,
				startedAt: null,
				completedAt: null,
				exceptionType: null,
				resolution: null,
				replacesTaskId: oTask.id
			});
			oBin.reserved += iQty;
			oWave.taskIds.push(oNewTask.id);
			oLine.shortQty += oException.missingQty - iQty;
			var oWorker = this._chooseWorkerFor(oException);
			oNewTask.workerId = oWorker.id;
			oWorker.queue.push(oNewTask.id);
			oTask.resolution = "alternative";
			this._log(oWave, "Information", "logAlternative", [oBin.id, oWorker.id, iQty]);
			oResult = { taskId: oNewTask.id, workerId: oWorker.id, qty: iQty };
		} else {
			oLine.shortQty += oException.missingQty;
			oTask.resolution = "skip";
			this._log(oWave, "Warning", "logSkipped", [oException.productId, oException.missingQty, oDelivery.id]);
		}
		oTask.status = "Done";
		oTask.completedAt = oState.time;
		oException.status = "Resolved";
		oException.resolvedAt = oState.time;
		oException.resolution = oResolution && oResolution.action === "alternative" ? "alternative" : "skip";
		oException.alternativeBinId = oResolution && oResolution.binId || null;
		var bStillOpen = oState.exceptions.some(function (oOther) {
			return oOther.status === "Open" && oOther.binId === oException.binId;
		});
		if (!bStillOpen) {
			this._index.bins[oException.binId].exception = null;
		}
		this._checkDelivery(oDelivery);
		this._checkWave(oWave);
		this._emit("exceptionResolved", { exceptionId: oException.id, waveId: oWave.id, resolution: oException.resolution });
		return oResult;
	};

	Engine.prototype._chooseWorkerFor = function (oException) {
		var that = this;
		var oOriginal = this._index.workers[oException.workerId];
		var bOriginalActive = oOriginal.queue.some(function (sId) {
			return that._index.tasks[sId].waveId === oException.waveId;
		}) || oOriginal.phase === "toBin" || oOriginal.phase === "pick";
		if (bOriginalActive) {
			return oOriginal;
		}
		return this._idlePickers()[0] || oOriginal;
	};

	/* ------------------------------------------------------------------ */
	/* Read access                                                          */
	/* ------------------------------------------------------------------ */

	/**
	 * The live state. Treat it as read-only; change it only through the engine.
	 *
	 * @returns {object} State
	 */
	Engine.prototype.getState = function () {
		return this.state;
	};

	Engine.prototype.get = function (sCollection, sId) {
		return this._index[sCollection][sId] || null;
	};

	Engine.prototype.getBinsForProduct = function (sProductId) {
		return (this._binsByProduct[sProductId] || []).slice();
	};

	Engine.prototype.getOpenDeliveries = function () {
		return this.state.deliveries.filter(function (oDelivery) {
			return oDelivery.status === "Open";
		});
	};

	Engine.prototype.isLate = function (oDelivery) {
		return !DISPATCHED[oDelivery.status] && oDelivery.dueTime < this.state.time;
	};

	Engine.prototype.getDeliveryUnits = function (oDelivery) {
		return this._deliveryUnits(oDelivery);
	};

	/**
	 * Key figures for the cockpit header.
	 *
	 * @returns {{openPicks: int, picksPerHour: int, dockOccupancy: int, lateDeliveries: int,
	 *   binUtilisation: int, openExceptions: int, occupiedDocks: int, dockCount: int}} KPIs
	 */
	Engine.prototype.getKpis = function () {
		var that = this;
		var oState = this.state;
		var iQty = 0;
		var iCapacity = 0;
		oState.bins.forEach(function (oBin) {
			iQty += oBin.qty;
			iCapacity += oBin.capacity;
		});
		var iOccupied = oState.docks.filter(function (oDock) {
			return !!oDock.truckId;
		}).length;
		return {
			openPicks: oState.tasks.filter(function (oTask) {
				return OPEN_TASK[oTask.status] && ACTIVE_WAVE[that._index.waves[oTask.waveId].status];
			}).length,
			picksPerHour: oState.pickLog.filter(function (iTime) {
				return iTime >= oState.time - HOUR;
			}).length,
			dockOccupancy: Math.round(iOccupied / oState.docks.length * 100),
			occupiedDocks: iOccupied,
			dockCount: oState.docks.length,
			lateDeliveries: oState.deliveries.filter(function (oDelivery) {
				return that.isLate(oDelivery);
			}).length,
			binUtilisation: Math.round(iQty / iCapacity * 100),
			openExceptions: oState.exceptions.filter(function (oException) {
				return oException.status === "Open";
			}).length
		};
	};

	/**
	 * Picks per hour of a worker over the shift so far.
	 */
	Engine.prototype.getProductivity = function (oWorker) {
		var fHours = Math.max(0.25, (this.state.time - this.state.shiftStart) / HOUR);
		var iDone = oWorker.type === "picker" ? oWorker.picksToday : oWorker.putawaysToday;
		return Math.round(iDone / fHours * 10) / 10;
	};

	/**
	 * Creates an engine.
	 *
	 * @param {object} [mOptions] See {@link Engine}
	 * @returns {Engine} Engine
	 */
	Engine.create = function (mOptions) {
		return new Engine(mOptions);
	};

	return Engine;
});
