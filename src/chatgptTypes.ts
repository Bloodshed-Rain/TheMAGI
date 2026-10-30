export interface ChatGPTProfileSummary {
  id: string;
  label: string;
  connected: boolean;
  sharing: boolean;
}
export interface ChatGPTStatus {
  activeProfileId: string | null;
  profiles: ChatGPTProfileSummary[];
  connected: boolean;
  sharing: boolean;
  busy: boolean;
}
export interface ChatGPTModel {
  id: string;
  label: string;
}
