import re
import sys

files = [
    "src/app/api/projects/[id]/brainstorm-entries/[entryId]/route.ts",
    "src/app/api/projects/[id]/brainstorm-entries/route.ts",
    "src/app/api/projects/[id]/communications/route.ts",
    "src/app/api/projects/[id]/delivery-mix/[mixId]/route.ts",
    "src/app/api/projects/[id]/delivery-mix/route.ts",
    "src/app/api/projects/[id]/invoices/[invoiceId]/route.ts",
    "src/app/api/projects/[id]/invoices/route.ts",
    "src/app/api/projects/[id]/members/[memberId]/route.ts",
    "src/app/api/projects/[id]/members/route.ts",
    "src/app/api/projects/[id]/milestones/[milestoneId]/route.ts",
    "src/app/api/projects/[id]/milestones/route.ts",
    "src/app/api/projects/[id]/resources/[allocationId]/route.ts",
    "src/app/api/projects/[id]/resources/recalculate/route.ts",
    "src/app/api/projects/[id]/resources/route.ts",
    "src/app/api/projects/[id]/risks/[riskId]/route.ts",
    "src/app/api/projects/[id]/risks/route.ts",
    "src/app/api/projects/[id]/solution-options/[optionId]/route.ts",
    "src/app/api/projects/[id]/solution-options/route.ts",
    "src/app/api/projects/[id]/sprints/[sprintId]/route.ts",
    "src/app/api/projects/[id]/sprints/route.ts",
    "src/app/api/projects/[id]/status-updates/route.ts",
    "src/app/api/projects/[id]/tasks/[taskId]/route.ts",
    "src/app/api/projects/[id]/tasks/[taskId]/time-entries/[entryId]/route.ts",
    "src/app/api/projects/[id]/tasks/[taskId]/time-entries/route.ts",
    "src/app/api/projects/[id]/tasks/route.ts",
]

pattern = re.compile(
    r'  const (\w+) = await requireRole\("(\w+)"\);\n'
    r'  if \(!\1\) return NextResponse\.json\(\{ error: "Forbidden" \}, \{ status: 403 \}\);\n'
    r'  const \{ ([\w, ]+) \} = await params;\n'
)

import_pattern = re.compile(r'import \{ requireRole \} from "@/lib/auth";\n')

for f in files:
    with open(f) as fh:
        content = fh.read()
    original = content

    matches = list(pattern.finditer(content))
    if not matches:
        print(f"NO MATCH: {f}")
        continue

    def repl(m):
        var, role, destructure = m.group(1), m.group(2), m.group(3)
        names = [n.strip() for n in destructure.split(",")]
        if "id" not in names:
            print(f"WARNING: no 'id' in destructure for {f}: {destructure}")
        return (
            f"  const {{ {destructure} }} = await params;\n"
            f'  const {var} = await requireProjectAccess("{role}", id);\n'
            f"  if (!{var}) return NextResponse.json({{ error: \"Forbidden\" }}, {{ status: 403 }});\n"
        )

    content = pattern.sub(repl, content)

    if import_pattern.search(content):
        content = import_pattern.sub('import { requireProjectAccess } from "@/lib/tenancy";\n', content, count=1)
    else:
        print(f"NO IMPORT LINE MATCH: {f}")

    if content == original:
        print(f"UNCHANGED: {f}")
    else:
        with open(f, "w") as fh:
            fh.write(content)
        print(f"UPDATED: {f}")
