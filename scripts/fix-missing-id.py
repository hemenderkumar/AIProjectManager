import re

files = [
    "src/app/api/projects/[id]/brainstorm-entries/[entryId]/route.ts",
    "src/app/api/projects/[id]/delivery-mix/[mixId]/route.ts",
    "src/app/api/projects/[id]/invoices/[invoiceId]/route.ts",
    "src/app/api/projects/[id]/members/[memberId]/route.ts",
    "src/app/api/projects/[id]/milestones/[milestoneId]/route.ts",
    "src/app/api/projects/[id]/resources/[allocationId]/route.ts",
    "src/app/api/projects/[id]/risks/[riskId]/route.ts",
    "src/app/api/projects/[id]/solution-options/[optionId]/route.ts",
    "src/app/api/projects/[id]/sprints/[sprintId]/route.ts",
    "src/app/api/projects/[id]/tasks/[taskId]/route.ts",
    "src/app/api/projects/[id]/tasks/[taskId]/time-entries/[entryId]/route.ts",
    "src/app/api/projects/[id]/tasks/[taskId]/time-entries/route.ts",
]

# Matches `const { X } = await params;\n  const VAR = await requireProjectAccess(...` where
# the destructure doesn't already include a standalone `id`.
pattern = re.compile(
    r'  const \{ ([\w, ]+) \} = await params;\n'
    r'(  const \w+ = await requireProjectAccess\()'
)

for f in files:
    with open(f) as fh:
        content = fh.read()
    original = content

    def repl(m):
        names = [n.strip() for n in m.group(1).split(",")]
        if "id" in names:
            return m.group(0)
        return f"  const {{ id, {m.group(1)} }} = await params;\n{m.group(2)}"

    content = pattern.sub(repl, content)

    if content == original:
        print(f"UNCHANGED: {f}")
    else:
        with open(f, "w") as fh:
            fh.write(content)
        print(f"FIXED: {f}")
