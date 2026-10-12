// Runs the simulations off the main thread, so sliders stay smooth while they compute.

import { hedgingStudy, pricerSimulations } from "./studies.js";

const TASKS = { pricer: pricerSimulations, hedging: hedgingStudy };

self.onmessage = ({ data: { id, task, args } }) => {
  self.postMessage({ id, result: TASKS[task](args) });
};
