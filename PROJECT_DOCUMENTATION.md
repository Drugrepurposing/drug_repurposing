# Technical Specification & Mathematical Formulation

## 1. GNN Drug-Target Interaction (DTI) Formulation

The heterogeneous biomedical graph is defined as \(\mathcal{G} = (\mathcal{V}, \mathcal{E})\), where node types \(\mathcal{V} = \mathcal{V}_{\text{drug}} \cup \mathcal{V}_{\text{target}} \cup \mathcal{V}_{\text{disease}}\) and edges \(\mathcal{E}\) represent known interactions, sequence similarities, and co-occurrences.

The message-passing update for node \(i\) at layer \(l+1\) is expressed as:
\[
h_i^{(l+1)} = \sigma \left( W^{(l)} h_i^{(l)} + \sum_{r \in \mathcal{R}} \sum_{j \in \mathcal{N}_i^r} \frac{1}{c_{i,r}} W_r^{(l)} h_j^{(l)} \right)
\]
where:
- \(\mathcal{R}\) is the set of edge relation types.
- \(\mathcal{N}_i^r\) represents neighbors of node \(i\) under relation \(r\).
- \(W_r^{(l)}\) is the relation-specific weight matrix.
- \(\sigma(\cdot)\) is a non-linear activation (ReLU / LeakyReLU).

The predicted binding score between drug \(d\) and target protein \(t\) is computed via inner product:
\[
\hat{y}_{d,t} = \sigma \left( h_d^{(L) T} W_{\text{pred}} h_t^{(L)} \right)
\]

---

## 2. Multi-Objective Pareto Ranking Engine

Candidates are scored using a weighted multi-modal relevance function:
\[
S_{\text{relevance}}(d) = w_1 \cdot S_{\text{GNN}}(d, t) + w_2 \cdot S_{\text{DisGeNET}}(g, dis) + w_3 \cdot S_{\text{LINCS}}(d) + w_4 \cdot S_{\text{NLP}}(d, dis)
\]
with default weights \(w_1 = 0.35, w_2 = 0.25, w_3 = 0.20, w_4 = 0.20\).

### Closed-Loop Biological Docking Adjustment
Biophysical binding energy \(\Delta G\) (kcal/mol) derived from AutoDock Vina adjusts the relevance score via a step multiplier:
\[
F_{\text{docking}}(\Delta G) = 
\begin{cases} 
1.08 & \text{if } \Delta G \le -10.0 \text{ kcal/mol} \\
1.04 & \text{if } -10.0 < \Delta G \le -8.0 \text{ kcal/mol} \\
1.00 & \text{if } -8.0 < \Delta G \le -6.0 \text{ kcal/mol} \\
0.70 & \text{if } \Delta G > -6.0 \text{ kcal/mol (Closed-loop feedback penalty)}
\end{cases}
\]

Final Pareto Score:
\[
S_{\text{overall}}(d) = S_{\text{relevance}}(d) \times F_{\text{docking}}(\Delta G) \times \left(0.8 + 0.2 \times S_{\text{safety}}(d)\right)
\]

---

## 3. AutoDock Vina Inhibition Constant Calculation

The inhibition constant \(K_i\) in nanomolar (nM) is calculated using the thermodynamic relationship:
\[
K_i = \exp\left( \frac{\Delta G}{R \cdot T} \right) \times 10^9
\]
where:
- \(R = 1.9872 \times 10^{-3} \text{ kcal/(mol}\cdot\text{K)}\)
- \(T = 298.15 \text{ K}\)

---

## 4. Multi-Agent Orchestration Protocol

The system deploys 3 specialized virtual research agents:
1. **Agent 1 (Data & Graph Miner)**: Performs heterogeneous node embedding extraction and multi-omics expression signature reversal matching.
2. **Agent 2 (Biophysical & Pathway Validator)**: Runs AutoDock Vina force field binding energy calculations and computes hypergeometric Reactome/KEGG pathway overlap p-values.
3. **Agent 3 (NLP & Safety Ranker)**: Mined PubMed SciBERT literature co-occurrences, computes ADMET safety likelihood scores, and composes plain-English explainability narratives.
