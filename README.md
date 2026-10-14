# Agent-System Interface Designs for Enterprise Platforms: A Comparative Empirical Study

Alexander Nygård. Master of Science thesis, DTU Compute, Technical University of Denmark (DTU), June 2026.

[Read the thesis (PDF)](master-thesis.pdf)

## Abstract

Although large language model (LLM) agents reason effectively, their practical value in enterprise settings is often limited by how they interface with target software. This thesis studies the agent harness (the non-model infrastructure handling actions, documentation, state placement, observations, and error feedback) as a performance-bearing architectural variable. We evaluate three harness designs using a shared, seeded local deployment of Ardoq, an enterprise architecture platform: traditional tool calling (H1), programmatic tool calling (H2) via sandboxed Python execution, and an agent-native domain module (H3) that raises the abstraction level over the same execution runtime.

The evaluation benchmark consists of 24 read-only analytical tasks based on recurring enterprise architecture workflows. Each task defines a typed output contract verified objectively in real time against the deployment’s live Ardoq API. Seven repeated runs per task-harness combination yield 504 evaluation runs.

Shifting from traditional tool calling to programmatic execution (H1→H2) removes a major state-coordination bottleneck. H2 increases the mean task success rate from 39.29% to 91.67% (+52.4 pp). It also reduces mean total tokens by 66%, the final context window by 45%, and estimated model cost per run by 48%. The largest gains concentrate on graph traversal, metamodel analysis, set construction, and cross-source composition; on these tasks, H1 typically fails either by exhausting its turn or time budget as context accumulates or by returning over-inclusive answers.

Raising the abstraction level (H2→H3) largely preserves correctness while further improving operational efficiency. H3’s exact pass rate is 91.07%, only 0.60 percentage points below H2, with no median per-task difference. It reduces mean total tokens by 18.9%, the final context window by 10.3%, per-task model cost by 15.2%, and wall-clock latency is 11.5% lower. One possible reason for H3’s slightly lower success rate is that its domain-tailored interface exposes less exploratory data, which saves tokens but may also limit the agent’s ability and inclination to explore when needed.

The findings support programmatic tool calling as the default for compositional enterprise workflows when code execution is operationally viable. Traditional tool calling remains sufficient for narrow report-based tasks. High-level domain modules are a selective trade-off, justified when stable, recurring workflows warrant the governance and maintenance costs of the abstraction. These conclusions are limited to one frontier model, one seeded Ardoq deployment, and read-only analytical tasks.
