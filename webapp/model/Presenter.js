sap.ui.define([
	"sap/ui/base/Object",
	"sap/ui/core/format/DateFormat",
	"sap/ui/core/format/NumberFormat"
], function (BaseObject, DateFormat, NumberFormat) {
	"use strict";

	var MINUTE = 60 * 1000;
	var PICK_TARGET = 50;
	var PUTAWAY_TARGET = 8;

	var WAVE_STATE = {
		Planned: { text: "wavePlanned", state: "None", icon: "sap-icon://appointment-2", highlight: "None", group: 2, groupText: "groupPlanned" },
		Released: { text: "waveReleased", state: "Information", icon: "sap-icon://paper-plane", highlight: "Information", group: 1, groupText: "groupActive" },
		InProgress: { text: "waveInProgress", state: "Information", icon: "sap-icon://in-progress", highlight: "Information", group: 1, groupText: "groupActive" },
		Completed: { text: "waveCompleted", state: "Success", icon: "sap-icon://sys-enter-2", highlight: "Success", group: 3, groupText: "groupCompleted" }
	};

	var BIN_STATE = {
		empty: { text: "binEmpty", state: "None" },
		low: { text: "binLow", state: "Warning" },
		ok: { text: "binOk", state: "Success" },
		full: { text: "binFull", state: "Information" },
		short: { text: "binShort", state: "Error" },
		blocked: { text: "binBlocked", state: "Error" }
	};

	var DELIVERY_STATE = {
		Open: "None",
		InWave: "Information",
		Picking: "Information",
		Picked: "Information",
		Packed: "Information",
		Loaded: "Success",
		Shipped: "Success"
	};

	var PRIORITY_STATE = { High: "Error", Medium: "Warning", Low: "None" };
	var TASK_STATE = { Open: "None", InProgress: "Information", Exception: "Error", Done: "Success" };
	var STRATEGY_TEXT = { DUE: "strategyDue", ZONE: "strategyZone", CUSTOMER: "strategyCustomer" };
	var LOG_ICON = { Information: "sap-icon://message-information", Success: "sap-icon://message-success", Warning: "sap-icon://message-warning", Error: "sap-icon://message-error" };
	var LOG_STATE = { Information: "Information", Success: "Success", Warning: "Warning", Error: "Error" };

	/**
	 * Turns the engine state into model data for the views. All texts come from
	 * the i18n bundle; the engine itself only knows ids and keys.
	 *
	 * @alias mindtek.warehouse.cockpit.model.Presenter
	 */
	var Presenter = BaseObject.extend("mindtek.warehouse.cockpit.model.Presenter", {
		constructor: function (oEngine, oBundle) {
			BaseObject.call(this);
			this._oEngine = oEngine;
			this._oBundle = oBundle;
			this._oTime = DateFormat.getTimeInstance({ pattern: "HH:mm", UTC: true });
			this._oClock = DateFormat.getTimeInstance({ pattern: "HH:mm:ss", UTC: true });
			this._oDate = DateFormat.getDateInstance({ pattern: "EEE d MMM", UTC: true });
			this._oDay = DateFormat.getDateInstance({ pattern: "d MMM", UTC: true });
			this._oDecimal = NumberFormat.getFloatInstance({ maxFractionDigits: 1, minFractionDigits: 1 });
			this._mWorkerTexts = {};
		},

		text: function (sKey, aParams) {
			return this._oBundle.getText(sKey, aParams);
		},

		time: function (iTime) {
			return iTime ? this._oTime.format(new Date(iTime)) : "";
		},

		duration: function (iSeconds) {
			var iMinutes = Math.max(1, Math.round(iSeconds / 60));
			return this.text("minutesValue", [iMinutes]);
		},

		product: function (sId) {
			return this._oEngine.get("products", sId);
		},

		workerName: function (sId) {
			var oWorker = this._oEngine.get("workers", sId);
			return oWorker ? oWorker.name : sId;
		},

		/* -------------------------------------------------------------- */
		/* Header                                                           */
		/* -------------------------------------------------------------- */

		clock: function () {
			var oDate = new Date(this._oEngine.getState().time);
			return {
				time: this._oClock.format(oDate),
				date: this._oDate.format(oDate)
			};
		},

		kpis: function () {
			var oKpi = this._oEngine.getKpis();
			var oState = this._oEngine.getState();
			var iActiveWaves = oState.waves.filter(function (oWave) {
				return oWave.status === "Released" || oWave.status === "InProgress";
			}).length;
			return {
				openPicks: {
					value: String(oKpi.openPicks),
					color: oKpi.openExceptions ? "Critical" : "Neutral",
					footer: oKpi.openExceptions ?
						this.text("kpiOpenPicksExceptions", [oKpi.openExceptions]) :
						this.text("kpiOpenPicksWaves", [iActiveWaves])
				},
				picksPerHour: {
					value: String(oKpi.picksPerHour),
					color: oKpi.picksPerHour >= 90 ? "Good" : (oKpi.picksPerHour >= 45 ? "Critical" : "Error"),
					footer: this.text("kpiPicksTarget", [90])
				},
				dockOccupancy: {
					value: String(oKpi.dockOccupancy),
					color: oKpi.dockOccupancy > 87 ? "Error" : (oKpi.dockOccupancy > 75 ? "Critical" : "Good"),
					footer: this.text("kpiDocksFooter", [oKpi.occupiedDocks, oKpi.dockCount])
				},
				lateDeliveries: {
					value: String(oKpi.lateDeliveries),
					color: oKpi.lateDeliveries === 0 ? "Good" : (oKpi.lateDeliveries <= 2 ? "Critical" : "Error"),
					footer: this.text("kpiLateFooter")
				},
				binUtilisation: {
					value: String(oKpi.binUtilisation),
					color: oKpi.binUtilisation > 85 || oKpi.binUtilisation < 35 ? "Critical" : "Good",
					footer: this.text("kpiBinsFooter", [oState.bins.length])
				}
			};
		},

		/* -------------------------------------------------------------- */
		/* Waves                                                            */
		/* -------------------------------------------------------------- */

		_waveCounts: function (oWave) {
			var oEngine = this._oEngine;
			var aTasks = oWave.taskIds.map(function (sId) {
				return oEngine.get("tasks", sId);
			});
			var aExceptions = oEngine.getState().exceptions.filter(function (oException) {
				return oException.waveId === oWave.id;
			});
			return {
				tasks: aTasks,
				done: aTasks.filter(function (oTask) {
					return oTask.status === "Done";
				}).length,
				exceptions: aExceptions,
				openExceptions: aExceptions.filter(function (oException) {
					return oException.status === "Open";
				}).length
			};
		},

		waves: function () {
			var that = this;
			return this._oEngine.getState().waves.map(function (oWave) {
				var oMeta = WAVE_STATE[oWave.status];
				var oCounts = that._waveCounts(oWave);
				var iTotal = oCounts.tasks.length;
				var fProgress = iTotal ? Math.round(oCounts.done / iTotal * 100) : 0;
				var sTime;
				if (oWave.status === "Completed") {
					sTime = that.text("waveTimeCompleted", [that.time(oWave.completedAt)]);
				} else if (oWave.status === "Planned") {
					sTime = that.text("waveTimeEstimate", [that.duration(oWave.estimatedSeconds)]);
				} else {
					sTime = that.text("waveTimeReleased", [that.time(oWave.releasedAt)]);
				}
				return {
					id: oWave.id,
					status: oWave.status,
					statusText: that.text(oMeta.text),
					statusState: oMeta.state,
					statusIcon: oMeta.icon,
					highlight: oCounts.openExceptions ? "Warning" : oMeta.highlight,
					group: oMeta.group,
					groupText: that.text(oMeta.groupText),
					sortKey: oMeta.group + "-" + (oMeta.group === 3 ? 9999 - parseInt(oWave.id.slice(2), 10) : oWave.id),
					subtitle: that.text("waveSubtitle", [oWave.deliveryIds.length, that.text(STRATEGY_TEXT[oWave.strategy])]),
					progress: fProgress,
					progressText: that.text("waveProgress", [oCounts.done, iTotal]),
					progressState: oCounts.openExceptions ? "Warning" : (oWave.status === "Completed" ? "Success" : "Information"),
					exceptionCount: oCounts.openExceptions,
					exceptionText: that.text("waveOpenExceptions", [oCounts.openExceptions]),
					timeText: sTime,
					ariaLabel: that.text("waveAria", [oWave.id, that.text(oMeta.text), oCounts.done, iTotal])
				};
			}).sort(function (a, b) {
				return a.sortKey < b.sortKey ? -1 : (a.sortKey > b.sortKey ? 1 : 0);
			});
		},

		logText: function (oEntry) {
			var aParams = oEntry.params.slice();
			var oProduct;
			switch (oEntry.key) {
				case "logShortPick":
				case "logBlockedBin":
					oProduct = this.product(aParams[2]);
					aParams[2] = oProduct ? oProduct.name : aParams[2];
					break;
				case "logAlternative":
					aParams[1] = this.workerName(aParams[1]);
					break;
				case "logSkipped":
					oProduct = this.product(aParams[0]);
					aParams[0] = oProduct ? oProduct.name : aParams[0];
					break;
				default:
					break;
			}
			return this.text(oEntry.key, aParams);
		},

		exceptionText: function (oException) {
			var oProduct = this.product(oException.productId);
			return this.text(oException.type === "short" ? "exceptionShort" : "exceptionBlocked",
				[oException.binId, oException.missingQty, oProduct.name]);
		},

		waveDetail: function (sId) {
			var that = this;
			var oEngine = this._oEngine;
			var oWave = oEngine.get("waves", sId);
			if (!oWave) {
				return null;
			}
			var oMeta = WAVE_STATE[oWave.status];
			var oCounts = this._waveCounts(oWave);
			var iTotal = oCounts.tasks.length;
			var oStation = oWave.stationId ? oEngine.get("stations", oWave.stationId) : null;
			return {
				id: oWave.id,
				title: this.text("waveTitle", [oWave.id]),
				status: oWave.status,
				statusText: this.text(oMeta.text),
				statusState: oMeta.state,
				statusIcon: oMeta.icon,
				canRelease: oWave.status === "Planned",
				strategyText: this.text(STRATEGY_TEXT[oWave.strategy]),
				progress: iTotal ? Math.round(oCounts.done / iTotal * 100) : 0,
				progressText: this.text("waveProgress", [oCounts.done, iTotal]),
				progressState: oCounts.openExceptions ? "Warning" : (oWave.status === "Completed" ? "Success" : "Information"),
				openExceptionCount: oCounts.openExceptions,
				exceptionStripText: this.text("waveExceptionStrip", [oCounts.openExceptions]),
				deliveryCount: oWave.deliveryIds.length,
				taskCount: iTotal,
				workersText: oWave.workerIds.length ? oWave.workerIds.map(function (sWorkerId) {
					return that.workerName(sWorkerId);
				}).join(", ") : this.text("notAssigned"),
				workersNeeded: oWave.workersNeeded,
				stationText: oStation ? (oStation.label || this.text("stationLabel", [oStation.id.slice(1)])) : this.text("notAssigned"),
				estimateText: this.duration(oWave.estimatedSeconds),
				createdAt: this.time(oWave.createdAt),
				releasedAt: this.time(oWave.releasedAt) || "–",
				startedAt: this.time(oWave.startedAt) || "–",
				completedAt: this.time(oWave.completedAt) || "–",
				exceptions: oCounts.exceptions.map(function (oException) {
					var bOpen = oException.status === "Open";
					return {
						id: oException.id,
						open: bOpen,
						title: that.text(oException.type === "short" ? "exceptionShortTitle" : "exceptionBlockedTitle", [oException.binId]),
						description: that.exceptionText(oException),
						statusText: bOpen ? that.text("exceptionOpen") : (oException.resolution === "alternative" ?
							that.text("exceptionResolvedAlternative", [oException.alternativeBinId]) : that.text("exceptionResolvedSkip")),
						statusState: bOpen ? "Error" : "Success",
						time: that.time(oException.raisedAt)
					};
				}).reverse(),
				deliveries: oWave.deliveryIds.map(function (sDeliveryId) {
					var oDelivery = oEngine.get("deliveries", sDeliveryId);
					return {
						id: oDelivery.id,
						customer: oDelivery.customer,
						due: that.time(oDelivery.dueTime),
						dueState: oEngine.isLate(oDelivery) ? "Error" : "None",
						statusText: that.text("delivery" + oDelivery.status),
						statusState: DELIVERY_STATE[oDelivery.status]
					};
				}),
				tasks: oCounts.tasks.map(function (oTask) {
					var oProduct = that.product(oTask.productId);
					return {
						id: oTask.id,
						binId: oTask.binId,
						product: oProduct.name,
						qtyText: that.text("qtyValue", [oTask.qty]),
						worker: oTask.workerId ? that.workerName(oTask.workerId) : that.text("notAssigned"),
						statusText: that.text("task" + oTask.status),
						statusState: TASK_STATE[oTask.status]
					};
				}),
				log: oWave.log.slice().reverse().map(function (oEntry) {
					return {
						text: that.logText(oEntry),
						time: that.time(oEntry.time),
						icon: LOG_ICON[oEntry.type],
						state: LOG_STATE[oEntry.type]
					};
				})
			};
		},

		/* -------------------------------------------------------------- */
		/* Bins                                                             */
		/* -------------------------------------------------------------- */

		binState: function (oBin) {
			if (oBin.exception) {
				return "exception";
			}
			var fFill = oBin.qty / oBin.capacity;
			if (oBin.qty === 0) {
				return "empty";
			}
			if (fFill < 0.25) {
				return "low";
			}
			if (fFill > 0.9) {
				return "full";
			}
			return "ok";
		},

		_binMeta: function (oBin) {
			var sState = this.binState(oBin);
			return BIN_STATE[sState === "exception" ? oBin.exception : sState];
		},

		_plannedBins: function () {
			var oEngine = this._oEngine;
			var mPlanned = {};
			oEngine.getState().tasks.forEach(function (oTask) {
				if (oTask.status === "Open" || oTask.status === "InProgress") {
					var oWave = oEngine.get("waves", oTask.waveId);
					if (oWave.status === "Released" || oWave.status === "InProgress") {
						mPlanned[oTask.binId] = true;
					}
				}
			});
			return mPlanned;
		},

		zoneLabel: function (sZoneId) {
			return this.text({ RECV: "zoneReceiving", STA: "zoneStorageA", STB: "zoneStorageB", PACK: "zonePacking" }[sZoneId]);
		},

		mapBins: function () {
			var that = this;
			var aBins = this._oEngine.getState().bins;
			var iMax = Math.max.apply(null, aBins.map(function (oBin) {
				return oBin.pickCount;
			}));
			var mPlanned = this._plannedBins();
			return aBins.map(function (oBin) {
				var oMeta = that._binMeta(oBin);
				var oProduct = that.product(oBin.productId);
				var sStatus = that.text(oMeta.text);
				var iFill = Math.round(oBin.qty / oBin.capacity * 100);
				return {
					id: oBin.id,
					state: that.binState(oBin),
					fill: oBin.qty / oBin.capacity,
					heat: oBin.pickCount / iMax,
					planned: !!mPlanned[oBin.id],
					ariaLabel: that.text("binAria", [oBin.id, oProduct.name, oBin.qty, oBin.capacity, sStatus]),
					tooltip: {
						title: that.text("binTitle", [oBin.id]),
						rows: [
							{ label: that.text("product"), value: oProduct.name },
							{ label: that.text("quantity"), value: that.text("qtyOfCapacity", [oBin.qty, oBin.capacity]) },
							{ label: that.text("fillLevel"), value: iFill + " %" },
							{ label: that.text("picks30Days"), value: String(oBin.pickCount) },
							{ label: that.text("status"), value: sStatus, state: oMeta.state }
						]
					}
				};
			});
		},

		binDetail: function (sId) {
			var that = this;
			var oEngine = this._oEngine;
			var oBin = oEngine.get("bins", sId);
			if (!oBin) {
				return null;
			}
			var oProduct = this.product(oBin.productId);
			var oMeta = this._binMeta(oBin);
			var oMovement = oBin.movements[0];
			var oException = oEngine.getState().exceptions.filter(function (oCandidate) {
				return oCandidate.binId === oBin.id && oCandidate.status === "Open";
			})[0];
			var aHistory = oBin.history.map(function (oPoint, i) {
				return { x: i, y: oPoint.qty };
			});
			var aOtherBins = oEngine.getBinsForProduct(oBin.productId).filter(function (oOther) {
				return oOther.id !== oBin.id;
			});
			return {
				id: oBin.id,
				title: this.text("binTitle", [oBin.id]),
				stateText: this.text(oMeta.text),
				stateState: oMeta.state,
				productName: oProduct.name,
				productId: oProduct.id,
				quantityText: this.text("qtyValue", [oBin.qty]),
				capacityText: this.text("qtyValue", [oBin.capacity]),
				reservedText: this.text("qtyValue", [oBin.reserved]),
				availableText: this.text("qtyValue", [Math.max(0, oBin.qty - oBin.reserved)]),
				fill: Math.round(oBin.qty / oBin.capacity * 100),
				fillText: this.text("qtyOfCapacity", [oBin.qty, oBin.capacity]),
				fillState: oMeta.state === "Warning" ? "Warning" : (oMeta.state === "Error" ? "Error" : "Success"),
				locationText: this.text("binLocation", [this.zoneLabel(oBin.zoneId), oBin.aisleId, oBin.position,
					this.text(oBin.side === "L" ? "sideLeft" : "sideRight")]),
				lastMovementText: oMovement ? this.text(oMovement.type === "pick" ? "movementPick" : "movementPutaway",
					[Math.abs(oMovement.qty), this.time(oMovement.time)]) : "–",
				pickCount: String(oBin.pickCount),
				otherBinsText: aOtherBins.length ? aOtherBins.map(function (oOther) {
					return that.text("binWithQty", [oOther.id, oOther.qty]);
				}).join(", ") : "–",
				hasException: !!oException,
				exceptionId: oException ? oException.id : "",
				exceptionText: oException ? this.exceptionText(oException) : "",
				history: aHistory,
				historyMin: Math.min.apply(null, aHistory.map(function (oPoint) {
					return oPoint.y;
				})),
				historyStart: this._oDay.format(new Date(oBin.history[0].time)),
				historyEnd: this.text("today"),
				historyFirst: String(aHistory[0].y),
				historyLast: String(aHistory[aHistory.length - 1].y),
				historyAria: this.text("historyAria", [oBin.id, aHistory[0].y, aHistory[aHistory.length - 1].y]),
				movements: oBin.movements.map(function (oEntry) {
					return {
						title: that.text(oEntry.type === "pick" ? "movementTypePick" : "movementTypePutaway"),
						time: that.time(oEntry.time),
						qtyText: (oEntry.qty > 0 ? "+" : "−") + Math.abs(oEntry.qty) + " " + that.text("unitPc"),
						state: oEntry.qty > 0 ? "Success" : "None"
					};
				})
			};
		},

		/* -------------------------------------------------------------- */
		/* Docks                                                            */
		/* -------------------------------------------------------------- */

		_dockMeta: function (oDock) {
			if (oDock.state === "free") {
				return { text: this.text("dockFree"), state: "None" };
			}
			if (oDock.state === "loading") {
				return { text: this.text(oDock.direction === "inbound" ? "dockUnloading" : "dockLoading"), state: "Success" };
			}
			return { text: this.text("dockOccupied"), state: "Information" };
		},

		_dockTitle: function (oDock) {
			return this.text(oDock.direction === "inbound" ? "dockTitleInbound" : "dockTitleOutbound", [oDock.id]);
		},

		_truckFill: function (oTruck) {
			if (!oTruck) {
				return 0;
			}
			if (oTruck.direction === "inbound") {
				return oTruck.pallets.filter(function (oPallet) {
					return !oPallet.claimed;
				}).length / Math.max(1, oTruck.pallets.length);
			}
			return oTruck.load / oTruck.capacity;
		},

		mapDocks: function () {
			var that = this;
			var oEngine = this._oEngine;
			return oEngine.getState().docks.map(function (oDock) {
				var oTruck = oDock.truckId ? oEngine.get("trucks", oDock.truckId) : null;
				var oMeta = that._dockMeta(oDock);
				var aRows = [{ label: that.text("status"), value: oMeta.text, state: oMeta.state }];
				if (oTruck) {
					aRows.push({ label: that.text("truck"), value: oTruck.plate });
					aRows.push({ label: that.text("carrier"), value: oEngine.get("carriers", oTruck.carrierId).name });
					aRows.push(oTruck.direction === "inbound" ?
						{ label: that.text("pallets"), value: that.text("palletsLeft", [that._palletsLeft(oTruck), oTruck.pallets.length]) } :
						{ label: that.text("load"), value: that.text("loadValue", [oTruck.load, oTruck.capacity]) });
					if (oTruck.etd) {
						aRows.push({ label: that.text("etd"), value: that.time(oTruck.etd) });
					}
				} else if (oDock.nextArrival) {
					aRows.push({ label: that.text("nextTruck"), value: that.time(oDock.nextArrival) });
				}
				return {
					id: oDock.id,
					state: oDock.state,
					fill: that._truckFill(oTruck),
					ariaLabel: that.text("dockAria", [that._dockTitle(oDock), oMeta.text]),
					tooltip: { title: that._dockTitle(oDock), rows: aRows }
				};
			});
		},

		_palletsLeft: function (oTruck) {
			return oTruck.pallets.filter(function (oPallet) {
				return !oPallet.claimed;
			}).length;
		},

		dockDetail: function (sId) {
			var that = this;
			var oEngine = this._oEngine;
			var oDock = oEngine.get("docks", sId);
			if (!oDock) {
				return null;
			}
			var oTruck = oDock.truckId ? oEngine.get("trucks", oDock.truckId) : null;
			var oMeta = this._dockMeta(oDock);
			var bInbound = oDock.direction === "inbound";
			var oCarrier = oTruck ? oEngine.get("carriers", oTruck.carrierId) : (oDock.carrierId ? oEngine.get("carriers", oDock.carrierId) : null);
			var aDeliveries = [];
			if (!bInbound) {
				var aIds = (oTruck ? oTruck.deliveryIds : []).concat(oDock.loading ? [oDock.loading.deliveryId] : []).concat(oDock.waiting);
				aDeliveries = aIds.map(function (sDeliveryId) {
					var oDelivery = oEngine.get("deliveries", sDeliveryId);
					var bLoading = oDock.loading && oDock.loading.deliveryId === sDeliveryId;
					return {
						id: oDelivery.id,
						customer: oDelivery.customer,
						units: that.text("qtyValue", [oEngine.getDeliveryUnits(oDelivery)]),
						statusText: bLoading ? that.text("dockLoading") : that.text("delivery" + oDelivery.status),
						statusState: bLoading ? "Information" : DELIVERY_STATE[oDelivery.status]
					};
				});
			}
			return {
				id: oDock.id,
				title: this._dockTitle(oDock),
				directionText: this.text(bInbound ? "inbound" : "outbound"),
				inbound: bInbound,
				stateText: oMeta.text,
				stateState: oMeta.state,
				hasTruck: !!oTruck,
				plate: oTruck ? oTruck.plate : "",
				carrier: oCarrier ? oCarrier.name : "–",
				eta: oTruck ? this.time(oTruck.arrivedAt) : (oDock.nextArrival ? this.time(oDock.nextArrival) : "–"),
				etaLabel: this.text(oTruck ? "arrived" : "nextTruck"),
				etd: oTruck && oTruck.etd ? this.time(oTruck.etd) : "–",
				fill: Math.round(this._truckFill(oTruck) * 100),
				fillText: oTruck ? (bInbound ?
					this.text("palletsLeft", [this._palletsLeft(oTruck), oTruck.pallets.length]) :
					this.text("loadValue", [oTruck.load, oTruck.capacity])) : "",
				freeText: oDock.nextArrival ? this.text("dockFreeNext", [this.time(oDock.nextArrival)]) : this.text("dockFreeText"),
				deliveries: aDeliveries,
				pallets: oTruck && bInbound ? oTruck.pallets.map(function (oPallet) {
					var oProduct = that.product(oPallet.productId);
					var sState = oPallet.done ? "palletStored" : (oPallet.claimed ? "palletMoving" : "palletWaiting");
					return {
						product: oProduct.name,
						qtyText: that.text("qtyValue", [oPallet.qty]),
						statusText: that.text(sState),
						statusState: oPallet.done ? "Success" : (oPallet.claimed ? "Information" : "None")
					};
				}) : []
			};
		},

		/* -------------------------------------------------------------- */
		/* Workers                                                          */
		/* -------------------------------------------------------------- */

		_statusText: function (sStatus) {
			return this.text("status_" + sStatus);
		},

		_taskText: function (oWorker) {
			var oEngine = this._oEngine;
			if (oWorker.type === "forklift") {
				if (!oWorker.job) {
					return this.text("noTask");
				}
				var oTruck = oEngine.get("trucks", oWorker.job.truckId);
				var oPallet = oTruck ? oTruck.pallets[oWorker.job.palletIndex] : oWorker.job.pallet;
				var oProduct = oPallet ? this.product(oPallet.productId) : null;
				return oWorker.job.binId ?
					this.text("taskPutaway", [oProduct ? oProduct.name : "", oWorker.job.binId]) :
					this.text("taskUnload", [oWorker.job.dockId]);
			}
			if (oWorker.currentTaskId) {
				var oTask = oEngine.get("tasks", oWorker.currentTaskId);
				return this.text("taskPick", [oTask.qty, this.product(oTask.productId).name, oTask.binId]);
			}
			if (oWorker.phase === "toPack" || oWorker.phase === "drop") {
				var oStation = oEngine.get("stations", oWorker.dropStationId);
				return this.text("taskDrop", [oStation.label || oStation.id]);
			}
			return this.text("noTask");
		},

		_workerTexts: function (oWorker) {
			var sStatus = this._statusText(oWorker.status);
			var sRole = this.text(oWorker.type === "forklift" ? "roleForklift" : "rolePicker");
			var sTitle = oWorker.type === "forklift" ? this.text("forkliftTitle", [oWorker.id, oWorker.name]) : oWorker.name;
			var aRows = [
				{ label: this.text("role"), value: sRole },
				{ label: this.text("status"), value: sStatus },
				{ label: this.text("currentTask"), value: this._taskText(oWorker) }
			];
			if (oWorker.type === "picker") {
				aRows.push({ label: this.text("picksToday"), value: String(oWorker.picksToday) });
			} else {
				aRows.push({ label: this.text("putawaysToday"), value: String(oWorker.putawaysToday) });
			}
			return {
				statusText: sStatus,
				ariaLabel: this.text("workerAria", [sTitle, sRole, sStatus]),
				tooltip: { title: sTitle, rows: aRows }
			};
		},

		/**
		 * Refreshes the cached worker texts. Call a few times per second; the
		 * per-frame worker data reuses them.
		 */
		refreshWorkerTexts: function () {
			var that = this;
			this._oEngine.getState().workers.forEach(function (oWorker) {
				that._mWorkerTexts[oWorker.id] = that._workerTexts(oWorker);
			});
		},

		/**
		 * Light per-frame worker data for the map.
		 */
		mapWorkers: function () {
			var mTexts = this._mWorkerTexts;
			return this._oEngine.getState().workers.map(function (oWorker) {
				var oTexts = mTexts[oWorker.id] || {};
				return {
					id: oWorker.id,
					type: oWorker.type,
					x: oWorker.x,
					y: oWorker.y,
					status: oWorker.status,
					statusText: oTexts.statusText,
					initials: oWorker.initials,
					path: oWorker.path.slice(oWorker.pathIndex),
					ariaLabel: oTexts.ariaLabel,
					tooltip: oTexts.tooltip
				};
			});
		},

		workerDetail: function (sId) {
			var that = this;
			var oEngine = this._oEngine;
			var oWorker = oEngine.get("workers", sId);
			if (!oWorker) {
				return null;
			}
			var bPicker = oWorker.type === "picker";
			var fRate = oEngine.getProductivity(oWorker);
			var iTarget = bPicker ? PICK_TARGET : PUTAWAY_TARGET;
			var iPercent = Math.min(100, Math.round(fRate / iTarget * 100));
			var oTask = oWorker.currentTaskId ? oEngine.get("tasks", oWorker.currentTaskId) : null;
			return {
				id: oWorker.id,
				title: bPicker ? oWorker.name : this.text("forkliftTitle", [oWorker.id, oWorker.name]),
				picker: bPicker,
				roleText: this.text(bPicker ? "rolePicker" : "roleForklift"),
				statusText: this._statusText(oWorker.status),
				statusState: oWorker.status === "idle" ? "None" : "Information",
				taskText: this._taskText(oWorker),
				waveId: oTask ? oTask.waveId : "",
				doneLabel: this.text(bPicker ? "picksToday" : "putawaysToday"),
				doneText: String(bPicker ? oWorker.picksToday : oWorker.putawaysToday),
				productivityText: this.text(bPicker ? "picksPerHourValue" : "putawaysPerHourValue", [this._oDecimal.format(fRate)]),
				productivityPercent: iPercent,
				productivityColor: iPercent >= 90 ? "Good" : (iPercent >= 70 ? "Critical" : "Error"),
				targetText: this.text(bPicker ? "pickTarget" : "putawayTarget", [iTarget]),
				carryingText: bPicker ? this.text("carryingValue", [oWorker.carrying.reduce(function (iSum, oItem) {
					return iSum + oItem.qty;
				}, 0)]) : "",
				queue: oWorker.queue.map(function (sTaskId) {
					var oQueued = oEngine.get("tasks", sTaskId);
					return {
						title: that.product(oQueued.productId).name,
						description: that.text("queueDescription", [oQueued.binId, oQueued.waveId]),
						qtyText: that.text("qtyValue", [oQueued.qty])
					};
				}),
				queueTitle: this.text("queueTitle", [oWorker.queue.length])
			};
		},

		/* -------------------------------------------------------------- */
		/* Object list                                                      */
		/* -------------------------------------------------------------- */

		objects: function () {
			var that = this;
			var oEngine = this._oEngine;
			var oState = oEngine.getState();
			var aRows = [];
			oState.docks.forEach(function (oDock) {
				var oMeta = that._dockMeta(oDock);
				var oTruck = oDock.truckId ? oEngine.get("trucks", oDock.truckId) : null;
				aRows.push({
					key: oDock.id,
					type: "dock",
					typeText: that.text("typeDock"),
					title: that._dockTitle(oDock),
					subtitle: oTruck ? oTruck.plate : "",
					location: that.zoneLabel(oDock.direction === "inbound" ? "RECV" : "PACK"),
					statusText: oMeta.text,
					statusState: oMeta.state,
					details: oTruck ? (oTruck.direction === "inbound" ?
						that.text("palletsLeft", [that._palletsLeft(oTruck), oTruck.pallets.length]) :
						that.text("loadValue", [oTruck.load, oTruck.capacity])) : (oDock.nextArrival ? that.text("dockFreeNext", [that.time(oDock.nextArrival)]) : ""),
					highlight: "None"
				});
			});
			oState.workers.forEach(function (oWorker) {
				var oTexts = that._workerTexts(oWorker);
				aRows.push({
					key: oWorker.id,
					type: "worker",
					typeText: that.text(oWorker.type === "forklift" ? "roleForklift" : "rolePicker"),
					title: oWorker.type === "forklift" ? that.text("forkliftTitle", [oWorker.id, oWorker.name]) : oWorker.name,
					subtitle: oWorker.id,
					location: that._locationOf(oWorker),
					statusText: oTexts.statusText,
					statusState: oWorker.status === "idle" ? "None" : "Information",
					details: that._taskText(oWorker),
					highlight: "None"
				});
			});
			oState.bins.forEach(function (oBin) {
				var oMeta = that._binMeta(oBin);
				aRows.push({
					key: oBin.id,
					type: "bin",
					typeText: that.text("typeBin"),
					title: that.text("binTitle", [oBin.id]),
					subtitle: that.product(oBin.productId).name,
					location: that.text("binLocationShort", [that.zoneLabel(oBin.zoneId), oBin.aisleId]),
					statusText: that.text(oMeta.text),
					statusState: oMeta.state,
					details: that.text("qtyOfCapacity", [oBin.qty, oBin.capacity]),
					highlight: oMeta.state === "Error" ? "Error" : "None"
				});
			});
			aRows.forEach(function (oRow) {
				oRow.search = [oRow.title, oRow.subtitle, oRow.location, oRow.statusText, oRow.details].join(" ").toLowerCase();
			});
			return aRows;
		},

		_locationOf: function (oWorker) {
			var oState = this._oEngine.getState();
			var oZone = oState.layout.zones.filter(function (oCandidate) {
				return oWorker.x >= oCandidate.x && oWorker.x <= oCandidate.x + oCandidate.width;
			})[0];
			return oZone ? this.zoneLabel(oZone.id) : "";
		},

		/* -------------------------------------------------------------- */
		/* Create wave                                                      */
		/* -------------------------------------------------------------- */

		openDeliveries: function (aSelectedIds) {
			var that = this;
			var oEngine = this._oEngine;
			return oEngine.getOpenDeliveries().slice().sort(function (a, b) {
				return a.dueTime - b.dueTime;
			}).map(function (oDelivery) {
				var bLate = oEngine.isLate(oDelivery);
				var aZones = [];
				oDelivery.lines.forEach(function (oLine) {
					var sZone = that.product(oLine.productId).zoneId === "STA" ? "A" : "B";
					if (aZones.indexOf(sZone) < 0) {
						aZones.push(sZone);
					}
				});
				return {
					id: oDelivery.id,
					customer: oDelivery.customer,
					due: that.time(oDelivery.dueTime),
					dueText: bLate ? that.text("overdue") : that.text("dueIn", [Math.max(1, Math.round((oDelivery.dueTime - oEngine.getState().time) / MINUTE))]),
					dueState: bLate ? "Error" : "None",
					late: bLate,
					priorityText: that.text("priority" + oDelivery.priority),
					priorityState: PRIORITY_STATE[oDelivery.priority],
					itemCount: oDelivery.lines.length,
					unitCount: oDelivery.lines.reduce(function (iSum, oLine) {
						return iSum + oLine.qty;
					}, 0),
					zonesText: aZones.sort().join(", "),
					selected: (aSelectedIds || []).indexOf(oDelivery.id) >= 0
				};
			});
		},

		preview: function (oPreview) {
			var that = this;
			return {
				taskCount: String(oPreview.taskCount),
				durationValue: oPreview.estimatedSeconds ? String(Math.max(1, Math.round(oPreview.estimatedSeconds / 60))) : "0",
				workersNeeded: String(oPreview.workersNeeded),
				unitCount: String(oPreview.unitCount),
				idleText: this.text("idlePickers", [oPreview.idlePickers]),
				messages: oPreview.messages.map(function (oMessage) {
					var aParams = oMessage.params.slice();
					if (oMessage.key === "msgShortStock") {
						aParams[1] = that.product(aParams[1]).name;
					}
					return {
						type: oMessage.type,
						title: that.text(oMessage.key, aParams),
						subtitle: that.text(oMessage.key + "Detail", aParams)
					};
				})
			};
		},

		/* -------------------------------------------------------------- */
		/* Exceptions                                                       */
		/* -------------------------------------------------------------- */

		resolveData: function (sExceptionId) {
			var that = this;
			var oEngine = this._oEngine;
			var oException = oEngine.get("exceptions", sExceptionId);
			var aAlternatives = oEngine.getAlternativeBins(sExceptionId).map(function (oCandidate) {
				var oBin = oEngine.get("bins", oCandidate.binId);
				return {
					binId: oCandidate.binId,
					text: that.text("alternativeOption", [oCandidate.binId, oCandidate.available, that.zoneLabel(oBin.zoneId)])
				};
			});
			return {
				exceptionId: sExceptionId,
				title: this.text(oException.type === "short" ? "exceptionShortTitle" : "exceptionBlockedTitle", [oException.binId]),
				description: this.exceptionText(oException),
				deliveryText: this.text("exceptionDelivery", [oException.deliveryId, oException.waveId]),
				alternatives: aAlternatives,
				hasAlternatives: aAlternatives.length > 0,
				binId: aAlternatives.length ? aAlternatives[0].binId : "",
				option: aAlternatives.length ? 0 : 1
			};
		}
	});

	return Presenter;
});
