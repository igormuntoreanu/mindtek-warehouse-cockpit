sap.ui.define([
	"sap/ui/core/mvc/Controller",
	"sap/ui/core/routing/History",
	"sap/ui/Device",
	"sap/ui/model/Filter",
	"sap/ui/model/FilterOperator",
	"sap/m/MessageToast",
	"sap/m/MessageBox",
	"./CreateWaveDialog",
	"./ResolveDialog"
], function (Controller, History, Device, Filter, FilterOperator, MessageToast, MessageBox, CreateWaveDialog, ResolveDialog) {
	"use strict";

	var RANGE_SET = "WarehouseCockpit";
	var BASE_RATE = 5;
	var MAX_FRAME = 0.1;
	var SLOW_INTERVAL = 250;
	var MAP_INTERVAL = 500;
	var LIST_INTERVAL = 1000;
	var PAGES = {
		waves: "wavesPage",
		wave: "wavePage",
		bin: "binPage",
		dock: "dockPage",
		worker: "workerPage"
	};
	var DETAIL = { wave: "waveDetail", bin: "binDetail", dock: "dockDetail", worker: "workerDetail" };

	return Controller.extend("mindtek.warehouse.cockpit.controller.Cockpit", {
		onInit: function () {
			var oComponent = this.getOwnerComponent();
			this._oEngine = oComponent.getSimulation();
			this._oPresenter = oComponent.getPresenter();
			this._oModel = oComponent.getModel();
			this._mSignatures = {};
			this._sDetailId = "";
			this._bRunning = true;

			var mPlayback = oComponent.getPlayback();
			this._oModel.setProperty("/playback", mPlayback.live ? "live" : "paused");
			this._oModel.setProperty("/speed", String(mPlayback.speed));

			this._oCreate = new CreateWaveDialog(this);
			this._oResolve = new ResolveDialog(this);
			this._decorateLayout();
			this.byId("floorMap").setLayout(this._oEngine.getState().layout);

			this._listen();
			this._listenForMotion();
			this._listenForLayout();
			this._listenForRoutes();
			this._listenForVisibility();

			this.refresh();
			this._iLastSlow = 0;
			this._iLastMap = 0;
			this._iLastObjects = 0;
			this._iLastFrame = 0;
			this._frame = this._frame.bind(this);
			this._ensureLoop();
		},

		onExit: function () {
			this._bRunning = false;
			if (this._iFrame) {
				window.cancelAnimationFrame(this._iFrame);
			}
			document.removeEventListener("visibilitychange", this._fnVisibility);
			if (this._oMotionQuery) {
				this._oMotionQuery.removeEventListener("change", this._fnMotion);
			}
			Device.media.detachHandler(this._fnLayout, this, RANGE_SET);
			if (this._fnCompleted) {
				this._oEngine.off("waveCompleted", this._fnCompleted);
				this._oEngine.off("exception", this._fnException);
			}
			this._oCreate.destroy();
			this._oResolve.destroy();
		},

		/** @returns {sap.m.routing.Router} The component router */
		getRouter: function () {
			return this.getOwnerComponent().getRouter();
		},

		/** @returns {mindtek.warehouse.cockpit.sim.Engine} The simulation */
		getSimulation: function () {
			return this._oEngine;
		},

		/** @returns {mindtek.warehouse.cockpit.model.Presenter} The presenter */
		getPresenter: function () {
			return this._oPresenter;
		},

		/**
		 * Reads the simulation into the view model and the map.
		 */
		refresh: function () {
			this._syncSlow();
			this._syncMap();
			this._syncFrame();
			if (this._oModel.getProperty("/view") === "list") {
				this._syncObjects();
			}
		},

		/* -------------------------------------------------------------- */
		/* Loop                                                             */
		/* -------------------------------------------------------------- */

		_ensureLoop: function () {
			var bLive = this._oModel.getProperty("/playback") === "live" && !document.hidden;
			if (bLive && !this._iFrame) {
				this._iLastFrame = 0;
				this._iFrame = window.requestAnimationFrame(this._frame);
			}
			if (!bLive && this._iFrame) {
				window.cancelAnimationFrame(this._iFrame);
				this._iFrame = 0;
			}
		},

		_frame: function (iNow) {
			this._iFrame = 0;
			if (!this._bRunning || document.hidden || this._oModel.getProperty("/playback") !== "live") {
				return;
			}
			this._iFrame = window.requestAnimationFrame(this._frame);
			var iLast = this._iLastFrame || iNow;
			this._iLastFrame = iNow;
			var fReal = Math.min(MAX_FRAME, (iNow - iLast) / 1000);
			if (fReal > 0) {
				var fSpeed = parseInt(this._oModel.getProperty("/speed"), 10) || 1;
				this._oEngine.tick(fReal * BASE_RATE * fSpeed);
			}
			if (iNow - this._iLastSlow >= SLOW_INTERVAL) {
				this._iLastSlow = iNow;
				this._syncSlow();
			}
			if (iNow - this._iLastMap >= MAP_INTERVAL) {
				this._iLastMap = iNow;
				this._syncMap();
			}
			if (this._oModel.getProperty("/view") === "list" && iNow - this._iLastObjects >= LIST_INTERVAL) {
				this._iLastObjects = iNow;
				this._syncObjects();
			}
			this._syncFrame();
		},

		_syncSlow: function () {
			var oPresenter = this._oPresenter;
			oPresenter.refreshWorkerTexts();
			this._set("/clock", oPresenter.clock());
			this._set("/kpis", oPresenter.kpis());
			this._syncWaves();
			this._syncDetail();
			this._flush();
		},

		_syncWaves: function () {
			var aWaves = this._oPresenter.waves();
			var oCounts = { all: aWaves.length, active: 0, planned: 0, completed: 0 };
			aWaves.forEach(function (oWave) {
				if (oWave.status === "Released" || oWave.status === "InProgress") {
					oCounts.active += 1;
				} else if (oWave.status === "Planned") {
					oCounts.planned += 1;
				} else {
					oCounts.completed += 1;
				}
			});
			this._set("/waveCounts", oCounts);
			this._writeList("/waves", aWaves);
		},

		_syncDetail: function () {
			var sPage = this._oModel.getProperty("/panel/page");
			if (!DETAIL[sPage] || !this._sDetailId) {
				return;
			}
			var oData = this._oPresenter[DETAIL[sPage]](this._sDetailId);
			if (oData) {
				this._set("/" + sPage, oData);
			}
		},

		_syncMap: function () {
			var oMap = this.byId("floorMap");
			oMap.setBins(this._oPresenter.mapBins());
			oMap.setDocks(this._oPresenter.mapDocks());
		},

		_syncFrame: function () {
			this.byId("floorMap").setWorkers(this._oPresenter.mapWorkers());
		},

		_syncObjects: function () {
			this._writeList("/objects", this._oPresenter.objects());
			this._flush();
		},

		_set: function (sPath, vValue) {
			var sSignature = JSON.stringify(vValue);
			if (this._mSignatures[sPath] === sSignature) {
				return;
			}
			this._mSignatures[sPath] = sSignature;
			this._oModel.setProperty(sPath, vValue);
		},

		/**
		 * Keeps the same row objects when the list shape is unchanged, so a
		 * refresh does not jump the scroll position.
		 */
		_writeList: function (sPath, aNext) {
			var sSignature = JSON.stringify(aNext);
			if (this._mSignatures[sPath] === sSignature) {
				return;
			}
			this._mSignatures[sPath] = sSignature;
			var aCurrent = this._oModel.getProperty(sPath);
			var bSameShape = Array.isArray(aCurrent) && aCurrent.length === aNext.length && aCurrent.every(function (oItem, i) {
				return (oItem.id || oItem.key) === (aNext[i].id || aNext[i].key);
			});
			if (!bSameShape) {
				this._oModel.setProperty(sPath, aNext);
				return;
			}
			aCurrent.forEach(function (oItem, i) {
				Object.keys(aNext[i]).forEach(function (sKey) {
					oItem[sKey] = aNext[i][sKey];
				});
			});
			this._bMutated = true;
		},

		_flush: function () {
			if (this._bMutated) {
				this._bMutated = false;
				this._oModel.checkUpdate(true);
			}
		},

		_decorateLayout: function () {
			var oPresenter = this._oPresenter;
			var oLayout = this._oEngine.getState().layout;
			oLayout.zones.forEach(function (oZone) {
				oZone.label = oPresenter.zoneLabel(oZone.id);
			});
			oLayout.stations.forEach(function (oStation) {
				oStation.label = oPresenter.text("stationLabel", [oStation.id.slice(1)]);
			});
		},

		/* -------------------------------------------------------------- */
		/* Layout, motion, visibility, routes                              */
		/* -------------------------------------------------------------- */

		_listenForLayout: function () {
			if (!Device.media.hasRangeSet(RANGE_SET)) {
				Device.media.initRangeSet(RANGE_SET, [600, 1024], "px", ["phone", "tablet", "desktop"]);
			}
			this._fnLayout = function (mParams) {
				this._applyLayout(mParams.name);
			}.bind(this);
			this._applyLayout(Device.media.getCurrentRange(RANGE_SET).name);
			Device.media.attachHandler(this._fnLayout, this, RANGE_SET);
		},

		_applyLayout: function (sName) {
			var oModel = this._oModel;
			var oBody = this.byId("body");
			oBody.toggleStyleClass("wcBody--phone", sName === "phone");
			oBody.toggleStyleClass("wcBody--tablet", sName === "tablet");
			if (this._sLayout === "phone" && sName !== "phone") {
				oModel.setProperty("/panel/visible", true);
			}
			if (sName === "phone") {
				oModel.setProperty("/panel/visible", oModel.getProperty("/panel/page") !== "waves");
				this.byId("page").setHeaderExpanded(false);
			}
			this._sLayout = sName;
			oModel.setProperty("/layout", sName);
		},

		_listenForMotion: function () {
			this._oMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
			this._fnMotion = function () {
				this._oModel.setProperty("/reducedMotion", this._oMotionQuery.matches);
			}.bind(this);
			this._fnMotion();
		},

		_listenForVisibility: function () {
			this._fnVisibility = function () {
				this._iLastFrame = 0;
				this._ensureLoop();
			}.bind(this);
			document.addEventListener("visibilitychange", this._fnVisibility);
		},

		_listenForRoutes: function () {
			var oRouter = this.getRouter();
			oRouter.getRoute("cockpit").attachPatternMatched(this._onCockpitMatched, this);
			oRouter.getRoute("wave").attachPatternMatched(this._onDetailMatched, this);
			oRouter.getRoute("bin").attachPatternMatched(this._onDetailMatched, this);
			oRouter.getRoute("dock").attachPatternMatched(this._onDetailMatched, this);
			oRouter.getRoute("worker").attachPatternMatched(this._onDetailMatched, this);
		},

		_onCockpitMatched: function () {
			this._sDetailId = "";
			this._oModel.setProperty("/panel/page", "waves");
			this._oModel.setProperty("/selectedKey", "");
			if (this._oModel.getProperty("/layout") === "phone") {
				this._oModel.setProperty("/panel/visible", false);
			}
			this._toPanel("waves");
		},

		_onDetailMatched: function (oEvent) {
			var sRoute = oEvent.getParameter("name");
			var sId = oEvent.getParameter("arguments")[sRoute + "Id"];
			var oData = this._oPresenter[DETAIL[sRoute]](sId);
			if (!oData) {
				this.getRouter().navTo("cockpit", {}, true);
				return;
			}
			this._sDetailId = sId;
			this._mSignatures["/" + sRoute] = "";
			this._oModel.setProperty("/" + sRoute, oData);
			this._mSignatures["/" + sRoute] = JSON.stringify(oData);
			this._oModel.setProperty("/panel/page", sRoute);
			this._oModel.setProperty("/panel/visible", true);
			this._oModel.setProperty("/selectedKey", sRoute === "wave" ? "" : sId);
			this._toPanel(sRoute);
		},

		_toPanel: function (sPage) {
			var oNav = this.byId("panel");
			var oPage = this.byId(PAGES[sPage]);
			if (!oNav || !oPage || oNav.getCurrentPage() === oPage) {
				return;
			}
			oNav.to(oPage, this._oModel.getProperty("/reducedMotion") ? "show" : "slide");
		},

		_listen: function () {
			var oPresenter = this._oPresenter;
			this._fnCompleted = function (oEvent) {
				MessageToast.show(oEvent.skipped ?
					oPresenter.text("toastWaveCompletedShort", [oEvent.waveId, oEvent.skipped]) :
					oPresenter.text("toastWaveCompleted", [oEvent.waveId]));
			};
			this._fnException = function (oEvent) {
				MessageToast.show(oPresenter.text(oEvent.exceptionType === "short" ? "toastShortPick" : "toastBlockedBin", [oEvent.binId]));
			};
			this._oEngine.on("waveCompleted", this._fnCompleted);
			this._oEngine.on("exception", this._fnException);
		},

		/* -------------------------------------------------------------- */
		/* Header and map                                                   */
		/* -------------------------------------------------------------- */

		onPlaybackChange: function () {
			this._iLastFrame = 0;
			this._ensureLoop();
		},

		onCreateWave: function (vSelection) {
			var aIds = Array.isArray(vSelection) ? vSelection : [];
			this._oCreate.open(aIds);
		},

		onKpiPress: function (oEvent) {
			var sKpi = oEvent.getSource().data("kpi");
			if (sKpi === "openPicks") {
				this._oModel.setProperty("/panel/waveFilter", "active");
				this._filterWaves();
				this.getRouter().navTo("cockpit");
				if (this._oModel.getProperty("/layout") !== "phone") {
					this._oModel.setProperty("/panel/visible", true);
				}
			} else if (sKpi === "picksPerHour") {
				this._showObjects("worker");
			} else if (sKpi === "dockOccupancy") {
				this._showObjects("dock");
			} else if (sKpi === "lateDeliveries") {
				var aLate = this._oPresenter.openDeliveries().filter(function (oDelivery) {
					return oDelivery.late;
				}).map(function (oDelivery) {
					return oDelivery.id;
				});
				if (!aLate.length) {
					MessageToast.show(this._oPresenter.text("toastNoLate"));
					return;
				}
				this._oCreate.open(aLate);
			} else if (sKpi === "binUtilisation") {
				this._oModel.setProperty("/view", "map");
				this._oModel.setProperty("/layers/heatMap", true);
			}
		},

		onViewChange: function () {
			if (this._oModel.getProperty("/view") === "list") {
				this._syncObjects();
				this._filterObjects();
			}
		},

		onZoomIn: function () {
			this.byId("floorMap").zoomIn();
		},

		onZoomOut: function () {
			this.byId("floorMap").zoomOut();
		},

		onFitToScreen: function () {
			this.byId("floorMap").fitToScreen();
		},

		onZoomChange: function (oEvent) {
			var fZoom = oEvent.getParameter("zoom");
			if (this._oModel.getProperty("/zoom") !== fZoom) {
				this._oModel.setProperty("/zoom", fZoom);
			}
		},

		onTogglePanel: function () {
			/* The pressed state is bound to /panel/visible. */
		},

		onMapSelect: function (oEvent) {
			var sKey = oEvent.getParameter("key");
			var sType = oEvent.getParameter("type");
			if (!sKey || !DETAIL[sType]) {
				this.getRouter().navTo("cockpit");
				return;
			}
			this.getRouter().navTo(sType, this._routeArguments(sType, sKey));
		},

		_routeArguments: function (sType, sId) {
			var mArguments = {};
			mArguments[sType + "Id"] = sId;
			return mArguments;
		},

		_showObjects: function (sType) {
			this._oModel.setProperty("/view", "list");
			this._oModel.setProperty("/objectFilter", sType);
			this._syncObjects();
			this._filterObjects();
		},

		/* -------------------------------------------------------------- */
		/* Lists                                                            */
		/* -------------------------------------------------------------- */

		onWaveFilterChange: function (oEvent) {
			this._oModel.setProperty("/panel/waveFilter", oEvent.getParameter("item").getKey());
			this._filterWaves();
		},

		_filterWaves: function () {
			var sKey = this._oModel.getProperty("/panel/waveFilter");
			var aFilters = [];
			if (sKey === "active") {
				aFilters.push(new Filter({
					filters: [
						new Filter("status", FilterOperator.EQ, "Released"),
						new Filter("status", FilterOperator.EQ, "InProgress")
					],
					and: false
				}));
			} else if (sKey === "planned" || sKey === "completed") {
				aFilters.push(new Filter("status", FilterOperator.EQ, sKey === "planned" ? "Planned" : "Completed"));
			}
			["panelList--waveList", "phoneList--waveList"].forEach(function (sId) {
				var oList = this.byId(sId);
				if (oList && oList.getBinding("items")) {
					oList.getBinding("items").filter(aFilters);
				}
			}, this);
		},

		onWavePress: function (oEvent) {
			var sId = oEvent.getSource().getBindingContext().getProperty("id");
			this.getRouter().navTo("wave", { waveId: sId });
		},

		onObjectFilterChange: function (oEvent) {
			this._oModel.setProperty("/objectFilter", oEvent.getParameter("item").getKey());
			this._filterObjects();
		},

		onObjectSearch: function (oEvent) {
			var sQuery = oEvent.getParameter("newValue");
			if (sQuery === undefined || sQuery === null) {
				sQuery = oEvent.getParameter("query") || "";
			}
			this._sObjectQuery = sQuery;
			this._filterObjects();
		},

		_filterObjects: function () {
			var aFilters = [];
			var sType = this._oModel.getProperty("/objectFilter");
			var sQuery = (this._sObjectQuery || "").trim().toLowerCase();
			if (sType && sType !== "all") {
				aFilters.push(new Filter("type", FilterOperator.EQ, sType));
			}
			if (sQuery) {
				aFilters.push(new Filter("search", FilterOperator.Contains, sQuery));
			}
			var oBinding = this.byId("objectsTable").getBinding("items");
			if (oBinding) {
				oBinding.filter(aFilters);
			}
		},

		onObjectPress: function (oEvent) {
			var oRow = oEvent.getSource().getBindingContext().getObject();
			this.getRouter().navTo(oRow.type, this._routeArguments(oRow.type, oRow.key));
		},

		/* -------------------------------------------------------------- */
		/* Panel                                                            */
		/* -------------------------------------------------------------- */

		onPanelBack: function () {
			var sPrevious = History.getInstance().getPreviousHash();
			if (sPrevious !== undefined) {
				window.history.back();
				return;
			}
			this.getRouter().navTo("cockpit", {}, true);
		},

		onClosePanel: function () {
			var bDetail = this._oModel.getProperty("/panel/page") !== "waves";
			this._oModel.setProperty("/panel/visible", false);
			if (bDetail && this._oModel.getProperty("/layout") === "phone") {
				this.getRouter().navTo("cockpit", {}, true);
			}
		},

		onReleaseWave: function () {
			var oPresenter = this._oPresenter;
			var oWave = this._oModel.getProperty("/wave");
			MessageBox.confirm(oPresenter.text("confirmRelease", [oWave.id, oWave.taskCount, oWave.workersNeeded]), {
				title: oPresenter.text("releaseWave"),
				actions: [MessageBox.Action.OK, MessageBox.Action.CANCEL],
				emphasizedAction: MessageBox.Action.OK,
				onClose: function (sAction) {
					if (sAction !== MessageBox.Action.OK) {
						return;
					}
					var oResult;
					try {
						oResult = this._oEngine.releaseWave(oWave.id);
					} catch (oError) {
						MessageBox.error(oPresenter.text(oError.message));
						this.refresh();
						return;
					}
					var sNames = oResult.workerIds.map(function (sId) {
						return oPresenter.workerName(sId);
					}).join(", ");
					MessageToast.show(oPresenter.text("toastWaveReleased", [oWave.id, oResult.taskCount, sNames]));
					this.refresh();
				}.bind(this)
			});
		},

		onResolveFromWave: function (oEvent) {
			this._oResolve.open(oEvent.getSource().getBindingContext().getProperty("id"));
		},

		onResolveFromBin: function () {
			var sId = this._oModel.getProperty("/bin/exceptionId");
			if (sId) {
				this._oResolve.open(sId);
			}
		},

		onWorkerWavePress: function () {
			var sWaveId = this._oModel.getProperty("/worker/waveId");
			if (sWaveId) {
				this.getRouter().navTo("wave", { waveId: sWaveId });
			}
		},

		/**
		 * Opens a wave in the side panel. Used after a wave is created.
		 *
		 * @param {string} sWaveId Wave
		 */
		showWave: function (sWaveId) {
			this.getRouter().navTo("wave", { waveId: sWaveId });
		}
	});
});
