# Pipeline Flow Diagram Widget

## Problem

The dashboard shows job results as flat logs. There's no visual representation of how items flow through the system (email arrives → classified → task created → character processes → draft created). n8n's flow diagrams make pipeline logic visible and debuggable.

## Goal

A dynamic, read-only flow diagram widget in the dashboard showing the actual pipeline with live execution data. Not an editor -- a visualization of the real system state.

## Approach

Use `@xyflow/react` and `@dagrejs/dagre` (already in package.json) to render pipeline flows. Each node represents a pipeline stage (Gmail trigger, classifier, Tana task creation, character dispatch, draft creation). Edges show the flow between stages. Nodes display:

- Last execution timestamp
- Items processed count
- Current status (idle, active, error)
- Success/failure indicators

Data comes from the pipeline timeline log (the `/api/external/log` endpoint being designed for the webhook system).

## Nodes

- **Trigger nodes**: Gmail webhook, WhatsApp scan, Calendar webhook (colored by source)
- **Filter nodes**: Flash-Lite classification (pass/archive counts)
- **Classification nodes**: Gemini Pro routing (action distribution)
- **Action nodes**: Tana task creation, Gmail draft, Calendar event, character escalation
- **Character nodes**: Show which character was spawned and for what

## Interaction

- Click a node to see recent executions (last 10 items that passed through)
- Click an edge to see items in transit
- Nodes pulse when active (reuse existing `pulse-crew` animation)

## Files

- Create: `components/home/PipelineFlowWidget.tsx`
- Reuses: `@xyflow/react`, `@dagrejs/dagre` (existing deps)
- Data from: pipeline timeline log API
