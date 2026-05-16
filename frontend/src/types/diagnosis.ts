export type PatientDetails = {
  fullName: string;
  age: string;
  gender: string;
  phone: string;
  email: string;
  address: string;
  city: string;
  state: string;
  country: string;
  pinCode: string;
  symptoms: string;
  latitude?: number;
  longitude?: number;
};

export type DiagnosisResponse = {
  status: string;
  diagnosis: "Normal" | "Abnormal";
  latent_representation: number[];
  abnormal_probability?: number | null;
  screening_threshold?: number | null;
};

export type HistoryRecord = {
  id: string;
  reportId?: string;
  patient: PatientDetails;
  fileName: string;
  fileType: string;
  sampleCount: number;
  diagnosis: "Normal" | "Abnormal";
  latentRepresentation: number[];
  createdAt: string;
  acquisition?: {
    samplingRate: string;
    lead: string;
    deviceId: string;
    technician: string;
    priority: "Routine" | "Urgent" | "Critical";
  };
};

export type ApiConfig = {
  endpoint: string;
  apiKey: string;
};
