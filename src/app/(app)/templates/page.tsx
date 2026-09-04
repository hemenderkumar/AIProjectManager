"use client";
import { useRouter } from "next/navigation";
import Topbar from "@/components/Topbar";
import ProjectTemplatePicker from "@/components/ProjectTemplatePicker";

export default function TemplatesPage() {
  const router = useRouter();

  return (
    <div>
      <Topbar
        title="Project Templates"
        subtitle="Start a new project from a saved skeleton instead of a blank page — save any existing project as a template from its Danger Zone settings"
      />
      <div className="p-8 max-w-4xl">
        <ProjectTemplatePicker onCreated={(id) => router.push(`/projects/${id}`)} />
      </div>
    </div>
  );
}
