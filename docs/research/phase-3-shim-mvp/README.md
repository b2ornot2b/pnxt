# Phase 3: The "Shim" MVP & Visual Decompilation

## Overview

Phase 3 bridges the theoretical architecture (Phases 1–2) to a **day-zero executable system**. A full HoTT/Active Inference stack is too complex for bootstrapping. Instead, we define a degraded but functional "Shim MVP" — a minimal runtime that executes typed dataflow graphs using off-the-shelf tools, with a concrete benchmark (Weather API → Celsius conversion → Database) demonstrating the paradigm end-to-end.

This phase also specifies the **Visual Node-Graph Decompiler** — the mechanism by which humans oversee massively concurrent DPN execution without the false linearity of imperative pseudocode.

## Documents

### 1. [Day-Zero Bootstrap Primitives](01-day-zero-bootstrap-primitives.md)
Defines the minimum viable toolchain to execute a VPIR graph today: degraded type system, simplified DPN runtime, SMT integration, IFC taint tracking, and constrained LLM output.

### 2. [Weather API Benchmark Workflow](02-weather-api-benchmark.md)
The canonical Shim MVP benchmark: fetch weather data from a REST API, verify and convert temperature (F→C) via SMT-backed constraints, route to a database — all as a typed DPN with IFC labels.

### 3. [Visual Node-Graph Decompiler](03-visual-node-graph-decompiler.md)
Specification for human oversight of concurrent dataflow execution: real-time graph visualization, localized state-pseudocode overlays, channel inspection, and temporal debugging.

## Relationship to Prior Phases

| Phase | Focus | Key Output |
|-------|-------|------------|
| Phase 1 | Core Architecture, State Separation & FFI | Static Logic Graph / Dynamic State Graph schemas, FFI mechanism |
| Phase 2 | Bridge Layer & Mathematical Spec | Bridge JSON Schema, HoTT morphism translation, SMT constraint pipeline |
| **Phase 3** | **Shim MVP & Visual Decompilation** | **Day-zero primitives, Weather API benchmark, Visual oversight spec** |
