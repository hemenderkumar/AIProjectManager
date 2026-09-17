-- Seeds the "Custom-Fit 3D-Printed Shoes" example idea used throughout the Idea-Type-Aware
-- Feasibility & Build Requirements scope doc -- a hardware/physical idea with a software
-- component (foot-measurement-to-print-model pipeline), walked through Feasibility, Build
-- Requirements, Architecture (as a process-flow diagram), Charter cost items (Material,
-- Labor, Implementation, Ongoing support), and the Sourcing/Staffing & Margin recommendations.
--
-- Run this AFTER add-idea-category-unit-economics-migration.sql. Skips if a project with this
-- exact name already exists, so it's safe to re-run.

DO $$
DECLARE
  new_id text := gen_random_uuid()::text;
  target_user_id text;
BEGIN
  IF EXISTS (SELECT 1 FROM projects WHERE name = 'Custom-Fit 3D-Printed Shoes') THEN
    RAISE NOTICE 'Project "Custom-Fit 3D-Printed Shoes" already exists -- skipping.';
    RETURN;
  END IF;

  -- Add as a project member so it shows up for this account regardless of role (internal-only
  -- projects are only visible to ADMIN plus whoever is a member) -- harmless no-op if this
  -- email doesn't exist in this database.
  SELECT id INTO target_user_id FROM users WHERE email = 'hemender.kumar@gmail.com';

  INSERT INTO projects (
    id, name, description, stage, priority, rag_status,
    problem_statement, proposed_solution, expected_benefits,
    idea_type, ideation_status, ideation_sub_stage,
    idea_category, has_software_component,
    feasibility_score, feasibility_notes, current_tech_landscape,
    build_materials_list, build_infrastructure_needs, build_sourcing_notes,
    recommended_technology, technical_recommendation_rationale,
    architecture_diagram, high_level_architecture, architecture_pros_cons,
    technical_review_status,
    material_cost_estimate, labor_cost_estimate, budget_planned, ongoing_support_monthly_cost,
    quoted_unit_price, target_margin_percent, target_monthly_volume,
    sourcing_recommendation, staffing_margin_recommendation,
    contingency_percent
  ) VALUES (
    new_id,
    'Custom-Fit 3D-Printed Shoes',
    $q$A shoe brand where each pair is 3D-printed to the customer's exact foot size and shape, ordered online, with no standard sizing.$q$,
    'CHARTER', 'MEDIUM', 'GREEN',
    $q$Standard shoe sizing (whole/half sizes, generic widths) forces a large share of buyers into a compromise fit -- too tight, too loose, or wrong arch/width support -- driving returns and dissatisfaction.$q$,
    $q$Customers submit foot measurements (initially app-guided; a dedicated scanning capability is a future dependency -- see feasibility notes below), and each shoe is 3D-printed on demand to that exact size and shape, with no standard sizing and no pre-built inventory.$q$,
    $q$Meaningfully fewer returns than standard-sized footwear, a real customization premium customers will pay for, and no pre-built size-run inventory risk since nothing is printed until it is ordered.$q$,
    'OPPORTUNITY', 'READY_FOR_CHARTER', 'CHARTER',
    'HARDWARE_PHYSICAL', true,
    62,
    $q$Feasible, with real caveats. 3D-printing a full shoe (not just a sole or insole) is proven at small scale (see Adidas' Climacool Slip-On, FitMyFoot/Wiivv's custom insoles) but is not yet a commodity, low-risk process at this business's likely scale. The core open problem is turning a customer's foot measurements into a reliably well-fitting, print-ready 3D model -- that has real prior art but is not solved off-the-shelf, so feasibility here rests on which measurement approach is chosen (in-store scanner vs. phone-based photogrammetry vs. manual sizing), not a confident guess. Assumptions: app-guided measurement is accurate enough to start with; a small pilot batch is run before committing to production scale.$q$,
    $q$No current production -- this is a new build from the ground up: no existing print farm, no measurement/fit pipeline, no fulfillment process today.$q$,
    $q$A pair uses roughly 400-800g of TPU/flexible filament for the upper plus a firmer sole material. A full printed shoe runs 3.5-4 days of continuous print time per pair on a single FDM printer, so throughput -- not material cost -- is the real production constraint at any real volume.$q$,
    $q$A small dedicated print farm (multiple FDM printers running in parallel to offset the multi-day print time per pair), a post-processing/assembly station (support removal, sole bonding, lacing, QA), and a foot-measurement intake step (app-guided initially) feeding the print pipeline.$q$,
    $q$Industrial FDM/SLS 3D printer suppliers; TPU and sole-material filament suppliers; contract manufacturers for non-printed components (laces, eyelets, packaging) rather than producing those in-house.$q$,
    $q$In-house FDM print farm, TPU uppers with a bonded firmer sole, app-guided foot measurement feeding a parametric shoe-model generator$q$,
    $q$Printing in-house (rather than outsourcing to a 3D-print service bureau) keeps unit economics viable at volume and keeps the fit-generation know-how in-house, which is the actual differentiator here. TPU is the standard, proven flexible filament for wearable printed footwear. The parametric measurement-to-model step is the highest-risk, least-proven part of this plan and should be validated with a small pilot batch before committing to production scale.$q$,
    $q$flowchart TD
  A[Customer submits foot measurements] --> B[Generate print-ready 3D shoe model]
  B --> C[Slice for printing]
  C --> D[3D print upper and sole]
  D --> E[Post-process: supports, bonding, assembly]
  E --> F[Quality check]
  F --> G[Package and ship]$q$,
    $q$Customer foot data is captured (app-guided measurement initially), converted into a print-ready parametric 3D model sized to that customer, sliced and printed on FDM equipment, then assembled (sole bonding, lacing), quality-checked, and shipped -- no pre-built inventory at any step.$q$,
    $q$- Optimizes for true per-customer fit and zero size-run inventory risk, at the cost of per-unit production speed (days, not minutes)
- In-house printing keeps fit-generation know-how and quality control internal, but requires real capital (a printer fleet) before volume justifies it
- App-guided measurement is the cheapest way to start but is also the least-proven part of the whole plan -- a pilot batch should validate real-world fit accuracy before scaling
- TPU material cost is a small share of total unit cost; printer throughput/capacity is the actual constraint on how many pairs can ship per week$q$,
    'APPROVED',
    25, 80.73, 30000, 900,
    180, 35, 150,
    $q$Filament / print materials: Insource -- the printer fleet is core production infrastructure either way, so buying raw filament and printing in-house is simpler than outsourcing partial print runs.
Laces, eyelets, hardware: Outsource -- commodity parts with no differentiation value; buying pre-made frees print capacity for the actual shoes.
Packaging: Outsource -- standard shipping/retail packaging, no reason to produce in-house at this stage.

Overall: insource what is core to the product's differentiation (the print itself) and outsource commodity components with no differentiation value, keeping capital spend focused on the printer fleet that is the real production bottleneck.$q$,
    $q$Team: 2 Print Operators, 1 QA/Assembly Technician, 0.5 Customer Support (part-time) -- sized to a 150 pairs/month target volume, where the print farm's throughput (not headcount) is the binding constraint.

Print Operator: 2 FTEs -- running the print farm and swapping print jobs across multiple machines to keep utilization high given the multi-day print time per pair (~$6,920/month at $20/hr from Rate Cards).
QA/Assembly Technician: 1 FTE -- post-processing, sole bonding, and quality check before shipment (~$3,460/month at $20/hr).
Customer Support: 0.5 FTE -- order intake, measurement guidance, and fit issues (~$1,730/month at $20/hr).

Total staffing cost: ~$12,110/month at target volume (150/month) = ~$80.73/unit.
Implied margin at quoted price ($180/unit) minus Material (~$25/unit) and this staffing cost: ~41.3%.
That clears the 35% target margin by ~6.3 points.$q$,
    10
  );

  IF target_user_id IS NOT NULL THEN
    INSERT INTO project_members (id, project_id, user_id) VALUES (gen_random_uuid()::text, new_id, target_user_id);
  END IF;

  INSERT INTO cost_items (id, project_id, category, name, amount, is_recurring, cadence, created_by_ai) VALUES
    (gen_random_uuid()::text, new_id, 'MATERIAL', 'TPU filament (upper), per pair', 15, false, 'per unit', true),
    (gen_random_uuid()::text, new_id, 'MATERIAL', 'Sole material, per pair', 10, false, 'per unit', true),
    (gen_random_uuid()::text, new_id, 'LABOR', 'Print Operator (2 FTE), per pair at target volume', 46.13, false, 'per unit', true),
    (gen_random_uuid()::text, new_id, 'LABOR', 'QA/Assembly Technician (1 FTE), per pair at target volume', 23.07, false, 'per unit', true),
    (gen_random_uuid()::text, new_id, 'LABOR', 'Customer Support (0.5 FTE), per pair at target volume', 11.53, false, 'per unit', true),
    (gen_random_uuid()::text, new_id, 'IMPLEMENTATION', 'FDM printer fleet (initial capex)', 18000, false, 'one-time', true),
    (gen_random_uuid()::text, new_id, 'IMPLEMENTATION', 'Measurement app / fit pipeline (initial build)', 12000, false, 'one-time', true),
    (gen_random_uuid()::text, new_id, 'ONGOING_SUPPORT', 'Printer maintenance and filament restocking', 900, true, 'monthly', true);

  RAISE NOTICE 'Seeded project "Custom-Fit 3D-Printed Shoes" with id %', new_id;
END $$;
