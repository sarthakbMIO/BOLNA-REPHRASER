export type Option = { value: string; condition: string };

export type Field = {
  id: string;
  name: string;
  category: string;
  model: string;
  is_objective: boolean;
  is_subjective: boolean;
  subjective_type: string | null;
  question: string;
  objective_options: Option[];
};

export type Rephrased = {
  name: string;
  question: string;
  objective_options?: Option[];
  change_notes?: string;
};

export type JobStatus = "pending" | "done" | "error";

export type Job = {
  id: string;
  createdAt: string;
  agentId: string;
  instruction: string;
  fields: Field[];
  status: JobStatus;
  docUrl?: string;
  error?: string;
  completedAt?: string;
};
