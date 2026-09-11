import { useState } from "react";

const SUGGESTED_SKILLS = [
  "JavaScript",
  "TypeScript",
  "React",
  "Node.js",
  "Python",
  "Java",
  "C#",
  "Go",
  "AWS",
  "Azure",
  "GCP",
  "Docker",
  "Kubernetes",
  "SQL",
  "NoSQL",
  "DynamoDB",
  "PostgreSQL",
  "MongoDB",
  "REST APIs",
  "GraphQL",
  "System Design",
  "Data Structures & Algorithms",
  "CI/CD",
  "Terraform",
  "Microservices",
  "Automated Testing",
  "Communication",
  "Leadership",
  "Product Management",
  "Machine Learning",
  "Data Engineering",
];

export function TagInput({
  label,
  tags,
  onChange,
  required,
}: {
  label: string;
  tags: string[];
  onChange: (tags: string[]) => void;
  required?: boolean;
}) {
  const [input, setInput] = useState("");
  const suggestions = SUGGESTED_SKILLS.filter(
    (skill) => skill.toLowerCase().includes(input.toLowerCase()) && !tags.includes(skill),
  ).slice(0, 6);

  function addTag(tag: string) {
    const trimmed = tag.trim();
    if (trimmed && !tags.includes(trimmed)) {
      onChange([...tags, trimmed]);
    }
    setInput("");
  }

  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
        {label}
        {required && <span className="text-red-600"> *</span>}
      </label>
      <div className="flex flex-wrap gap-1 rounded border border-slate-300 p-2 dark:border-slate-700 dark:bg-slate-900">
        {tags.map((tag) => (
          <span
            key={tag}
            className="flex items-center gap-1 rounded-full bg-sky-100 px-2 py-1 text-xs text-sky-800 dark:bg-sky-950 dark:text-sky-200"
          >
            {tag}
            <button type="button" className="text-sky-600 hover:text-sky-900" onClick={() => onChange(tags.filter((t) => t !== tag))}>
              ×
            </button>
          </span>
        ))}
        <input
          className="min-w-[8rem] flex-1 border-none bg-transparent p-1 text-sm outline-none"
          placeholder="Add a skill and press Enter"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onBlur={() => {
            if (input.trim()) {
              addTag(input);
            }
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === "," || event.key === "Tab") {
              event.preventDefault();
              addTag(input);
            }
          }}
        />
      </div>
      {input && suggestions.length > 0 && (
        <div className="mt-1 flex flex-wrap gap-1">
          {suggestions.map((skill) => (
            <button
              type="button"
              key={skill}
              className="rounded-full border border-sky-300 px-2 py-1 text-xs text-sky-700 hover:bg-sky-50 dark:border-sky-800 dark:text-sky-300"
              onClick={() => addTag(skill)}
            >
              + {skill}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
