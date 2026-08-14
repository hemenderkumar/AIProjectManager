import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { listTemplates, createTemplateFromProject, createProjectFromTemplate } from "@/lib/templates";

export async function GET() {
  const user = await requireRole("VIEWER");
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const data = await listTemplates(user);
  return NextResponse.json(data);
}

// Two actions in one POST, disambiguated by body.action, rather than two routes — both are
// tiny single-purpose mutations and neither needs its own resource path.
export async function POST(req: NextRequest) {
  const user = await requireRole("CONTRIBUTOR");
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await req.json();

  if (body.action === "create_from_project") {
    if (!body.projectId || !body.name) {
      return NextResponse.json({ error: "projectId and name are required" }, { status: 400 });
    }
    const created = await createTemplateFromProject(user, body.projectId, body.name, body.description);
    if (!created) return NextResponse.json({ error: "not found or forbidden" }, { status: 404 });
    return NextResponse.json(created, { status: 201 });
  }

  if (body.action === "instantiate") {
    if (!body.templateId || !body.newProjectName) {
      return NextResponse.json({ error: "templateId and newProjectName are required" }, { status: 400 });
    }
    const created = await createProjectFromTemplate(user, body.templateId, body.newProjectName);
    if (!created) return NextResponse.json({ error: "template not found" }, { status: 404 });
    return NextResponse.json(created, { status: 201 });
  }

  return NextResponse.json({ error: "unknown action" }, { status: 400 });
}
