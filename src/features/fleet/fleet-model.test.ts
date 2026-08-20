import { describe, expect, it } from "vitest";
import { fleetTotals, type FleetDeviceSnapshot } from "./fleet-model";
const base: FleetDeviceSnapshot={status:"online",latencyMs:10,outboundMode:"rule",traffic:{uploadRate:20,downloadRate:40,totalUpload:0,totalDownload:0},activeRequests:3,checkedAt:1};
describe("fleetTotals",()=>{it("aggregates online state and live metrics",()=>{expect(fleetTotals([base,{...base,status:"offline",traffic:null,activeRequests:0}])).toEqual({online:1,offline:1,missingKey:0,uploadRate:20,downloadRate:40,activeRequests:3})});it("tracks devices without keys",()=>{expect(fleetTotals([{...base,status:"missing-key",traffic:null,activeRequests:0}]).missingKey).toBe(1)})});
