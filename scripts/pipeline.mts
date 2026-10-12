// Temporal pipeline CLI.
//   tsx scripts/pipeline.mts worker                 run the worker (all workflows + activities)
//   tsx scripts/pipeline.mts health                 check every connector
//   tsx scripts/pipeline.mts schedules              create/update the Temporal Schedules
//   tsx scripts/pipeline.mts start-trade-feed       start the long-running trade-feed workflow
//   tsx scripts/pipeline.mts run <workflow> [json]  run one workflow and print its result
//     e.g. run walletBackfill '{"batchSize":10,"maxBatches":1}'
import "dotenv/config";
import { WorkflowIdReusePolicy } from "@temporalio/client";
import { sql } from "../src/lib/db";
import { checkConnectors } from "../src/pipeline/jobs";
import { connectClient, createWorker, TASK_QUEUE, upsertSchedules } from "../src/pipeline/temporal";

const [cmd, ...rest] = process.argv.slice(2);

switch (cmd) {
  case "worker": {
    const worker = await createWorker();
    console.log(`worker polling task queue "${TASK_QUEUE}"`);
    await worker.run();
    break;
  }
  case "health": {
    console.table(await checkConnectors());
    break;
  }
  case "schedules": {
    await upsertSchedules(await connectClient());
    break;
  }
  case "start-trade-feed": {
    const client = await connectClient();
    const handle = await client.workflow.start("tradeFeed", {
      taskQueue: TASK_QUEUE,
      workflowId: "trade-feed",
      args: [{ everySeconds: 30 }],
      workflowIdReusePolicy: WorkflowIdReusePolicy.ALLOW_DUPLICATE,
    });
    console.log(`started ${handle.workflowId} (run ${handle.firstExecutionRunId})`);
    break;
  }
  case "run": {
    const [workflowType, json] = rest;
    if (!workflowType) throw new Error("usage: run <workflow> [json-args]");
    const client = await connectClient();
    const result = await client.workflow.execute(workflowType, {
      taskQueue: TASK_QUEUE,
      workflowId: `manual/${workflowType}/${Date.now()}`,
      args: json ? [JSON.parse(json)] : [],
    });
    console.log(JSON.stringify(result, null, 2));
    break;
  }
  default:
    console.log("commands: worker | health | schedules | start-trade-feed | run <workflow> [json]");
}
await sql.end();
