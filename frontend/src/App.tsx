import { ChangeEvent, FormEvent, useMemo, useState } from "react";
import {
  Activity,
  AlertCircle,
  BadgeCheck,
  BarChart3,
  CheckCircle2,
  ClipboardList,
  Crosshair,
  Download,
  FileText,
  Gauge,
  HeartPulse,
  History,
  Loader2,
  MapPin,
  MonitorCog,
  Radio,
  Search,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  UploadCloud,
  UserRound,
  Wifi,
} from "lucide-react";
import { DEFAULT_API_CONFIG, diagnoseEcg, readSignalFile } from "./api/ecgApi";
import { EcgWaveform } from "./components/EcgWaveform";
import { LatentFeatureChart } from "./components/LatentFeatureChart";
import type { ApiConfig, HistoryRecord, PatientDetails } from "./types/diagnosis";

const HISTORY_KEY = "ecg_diagnosis_history";

type TabId = "overview" | "patient" | "analysis" | "insights" | "reports" | "records" | "settings";
type ReportFormat = "clinical" | "technical";
type FilterMode = "raw" | "smooth" | "normalized";
type DiagnosisFilter = "All" | "Normal" | "Abnormal";
type PriorityFilter = "All" | "Routine" | "Urgent" | "Critical";
type ExportFormat = "pdf" | "csv" | "json";

type AcquisitionSettings = {
  samplingRate: string;
  lead: string;
  deviceId: string;
  technician: string;
  priority: "Routine" | "Urgent" | "Critical";
};

const emptyPatient: PatientDetails = {
  fullName: "",
  age: "",
  gender: "",
  phone: "",
  email: "",
  address: "",
  city: "",
  state: "",
  country: "India",
  pinCode: "",
  symptoms: "",
};

const defaultAcquisition: AcquisitionSettings = {
  samplingRate: "500 Hz",
  lead: "Lead II",
  deviceId: "ECG-LOCAL-01",
  technician: "",
  priority: "Routine",
};

function loadHistory(): HistoryRecord[] {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]") as HistoryRecord[];
  } catch {
    return [];
  }
}

function App() {
  const [activeTab, setActiveTab] = useState<TabId>("overview");
  const [patient, setPatient] = useState<PatientDetails>(emptyPatient);
  const [acquisition, setAcquisition] = useState<AcquisitionSettings>(defaultAcquisition);
  const [apiConfig, setApiConfig] = useState<ApiConfig>(DEFAULT_API_CONFIG);
  const [file, setFile] = useState<File | null>(null);
  const [signalValues, setSignalValues] = useState<number[]>([]);
  const [history, setHistory] = useState<HistoryRecord[]>(loadHistory);
  const [historySearch, setHistorySearch] = useState("");
  const [activeRecord, setActiveRecord] = useState<HistoryRecord | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const [error, setError] = useState("");
  const [filterMode, setFilterMode] = useState<FilterMode>("raw");
  const [reportFormat, setReportFormat] = useState<ReportFormat>("clinical");
  const [includeLatents, setIncludeLatents] = useState(true);
  const [includePatientNotes, setIncludePatientNotes] = useState(true);
  const [historyDate, setHistoryDate] = useState("");
  const [historyDiagnosis, setHistoryDiagnosis] = useState<DiagnosisFilter>("All");
  const [historyPriority, setHistoryPriority] = useState<PriorityFilter>("All");

  const requiredPatientFieldsReady = useMemo(
    () =>
      Boolean(
        patient.fullName.trim() &&
          patient.age.trim() &&
          patient.gender.trim() &&
          patient.phone.trim() &&
          patient.address.trim() &&
          patient.city.trim() &&
          patient.state.trim(),
      ),
    [patient],
  );

  const latestRecord = activeRecord || history[0] || null;
  const abnormalCount = history.filter((record) => record.diagnosis === "Abnormal").length;
  const normalCount = history.filter((record) => record.diagnosis === "Normal").length;
  const qualityScore = signalValues.length >= 500 ? Math.min(100, Math.round((signalValues.length / 500) * 82)) : 0;

  const displayedSignal = useMemo(() => transformSignal(signalValues, filterMode), [signalValues, filterMode]);

  function updatePatient(field: keyof PatientDetails, value: string) {
    setPatient((current) => ({ ...current, [field]: value }));
  }

  function updateAcquisition(field: keyof AcquisitionSettings, value: string) {
    setAcquisition((current) => ({ ...current, [field]: value } as AcquisitionSettings));
  }

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const selectedFile = event.target.files?.[0];
    if (!selectedFile) return;

    setError("");
    const extension = selectedFile.name.split(".").pop()?.toLowerCase();

    if (!["txt", "csv"].includes(extension || "")) {
      setError("Please upload a TXT or CSV ECG file.");
      setFile(null);
      setSignalValues([]);
      return;
    }

    let values: number[];
    try {
      values = await readSignalFile(selectedFile);
    } catch (fileError) {
      setError(fileError instanceof Error ? fileError.message : "Could not read the selected ECG file.");
      setFile(null);
      setSignalValues([]);
      return;
    }

    if (values.length < 500) {
      setError(`The selected file has ${values.length} ECG samples. This backend model needs 500 samples.`);
      setFile(null);
      setSignalValues([]);
      return;
    }

    setFile(selectedFile);
    setSignalValues(values);
    setActiveTab("analysis");
  }

  function useCurrentLocation() {
    if (!navigator.geolocation) {
      setError("Location is not supported in this browser.");
      return;
    }

    setIsLocating(true);
    setError("");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setPatient((current) => ({
          ...current,
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        }));
        setIsLocating(false);
      },
      () => {
        setError("Could not read current location. You can enter the address manually.");
        setIsLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  async function handleSubmit(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    setError("");

    if (!requiredPatientFieldsReady) {
      setError("Complete required patient details before running diagnosis.");
      setActiveTab("patient");
      return;
    }

    if (!file) {
      setError("Select a TXT or CSV ECG file before running diagnosis.");
      setActiveTab("analysis");
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await diagnoseEcg(file, apiConfig);
      const record: HistoryRecord = {
        id: crypto.randomUUID(),
        reportId: `ECG-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${history.length + 1}`,
        patient,
        fileName: file.name,
        fileType: file.type || "text/plain",
        sampleCount: signalValues.length,
        diagnosis: response.diagnosis,
        latentRepresentation: response.latent_representation,
        createdAt: new Date().toISOString(),
        acquisition,
      };

      const nextHistory = [record, ...history];
      setHistory(nextHistory);
      setActiveRecord(record);
      localStorage.setItem(HISTORY_KEY, JSON.stringify(nextHistory));
      setActiveTab("reports");
    } catch (diagnosisError) {
      setError(diagnosisError instanceof Error ? diagnosisError.message : "Diagnosis request failed.");
    } finally {
      setIsSubmitting(false);
    }
  }

  function downloadReport(record: HistoryRecord | null = latestRecord) {
    if (!record) {
      setError("Run a diagnosis before downloading a report.");
      return;
    }

    const pdf = buildReportPdf(record, reportFormat, includeLatents, includePatientNotes);
    downloadBlob(pdf, `${reportFileBaseName(record)}.pdf`, "application/pdf");
  }

  function exportReport(format: ExportFormat, record: HistoryRecord | null = latestRecord) {
    if (!record) {
      setError("Run a diagnosis before exporting report data.");
      return;
    }

    if (format === "pdf") {
      downloadReport(record);
      return;
    }

    if (format === "csv") {
      downloadBlob(buildReportCsv(record), `${reportFileBaseName(record)}.csv`, "text/csv");
      return;
    }

    downloadBlob(JSON.stringify(buildReportJson(record), null, 2), `${reportFileBaseName(record)}.json`, "application/json");
  }

  function downloadBlob(data: BlobPart, fileName: string, type: string) {
    const blob = new Blob([data], { type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName.replace(/\s+/g, "-");
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-900">
      <div className="fixed inset-0 -z-10 bg-app-shell" />

      <header className="border-b border-white/10 bg-slate-950/95 text-white backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-600 bg-slate-800 text-slate-100 shadow-lg shadow-slate-950/20">
              <HeartPulse className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight">ECG Monitoring & Analysis System</h1>
              <p className="text-xs text-slate-300">Patient intake, ECG review, diagnosis, and reports.</p>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <MetricPill label="API" value="FastAPI" icon={<Wifi className="h-4 w-4" />} />
            <MetricPill label="Cases" value={`${history.length}`} icon={<ClipboardList className="h-4 w-4" />} />
            <MetricPill label="Quality" value={qualityScore ? `${qualityScore}%` : "Ready"} icon={<Gauge className="h-4 w-4" />} />
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-6xl gap-4 px-4 py-4 lg:grid-cols-[220px_minmax(0,1fr)]">
        <aside className="h-fit rounded-lg border border-white/10 bg-white/95 p-2 shadow-panel">
          <nav className="space-y-1">
            {[
              { id: "overview", label: "Overview", icon: <BarChart3 className="h-4 w-4" /> },
              { id: "patient", label: "Patient Intake", icon: <UserRound className="h-4 w-4" /> },
              { id: "analysis", label: "ECG Analysis", icon: <Activity className="h-4 w-4" /> },
              { id: "insights", label: "Insights", icon: <Gauge className="h-4 w-4" /> },
              { id: "reports", label: "Reports", icon: <FileText className="h-4 w-4" /> },
              { id: "records", label: "Case Records", icon: <History className="h-4 w-4" /> },
              { id: "settings", label: "Settings", icon: <Settings className="h-4 w-4" /> },
            ].map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id as TabId)}
                className={
                  activeTab === item.id
                    ? "flex w-full items-center gap-2 rounded-md bg-slate-950 px-3 py-2.5 text-xs font-semibold text-white"
                    : "flex w-full items-center gap-2 rounded-md px-3 py-2.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-100 hover:text-slate-950"
                }
              >
                {item.icon}
                {item.label}
              </button>
            ))}
          </nav>

          <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-800">
              <ShieldCheck className="h-4 w-4" />
              Workflow Status
            </div>
            <WorkflowStep done={requiredPatientFieldsReady} label="Patient details" />
            <WorkflowStep done={Boolean(file)} label="ECG file loaded" />
            <WorkflowStep done={Boolean(latestRecord)} label="Report available" />
          </div>
        </aside>

        <section className="min-w-0 space-y-4">
          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-700">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {activeTab === "overview" && (
            <div className="space-y-4">
              <div className="grid gap-3 md:grid-cols-4">
                <StatCard label="Total Reports" value={history.length.toString()} helper="Saved in this browser" tone="slate" />
                <StatCard label="Normal" value={normalCount.toString()} helper="Screened as stable" tone="green" />
                <StatCard label="Abnormal" value={abnormalCount.toString()} helper="Needs review" tone="red" />
                <StatCard label="Current Samples" value={signalValues.length ? signalValues.length.toString() : "0"} helper="Minimum 500 required" tone="blue" />
              </div>

              <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
                <Panel>
                  <SectionHeading icon={<Activity className="h-5 w-5" />} title="Live ECG Workspace" subtitle="Preview the selected waveform and move into analysis." />
                  <div className="mt-4">
                    <EcgWaveform values={displayedSignal} />
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <button type="button" onClick={() => setActiveTab("patient")} className="btn-secondary">
                      <UserRound className="h-4 w-4" />
                      Edit Patient
                    </button>
                    <button type="button" onClick={() => setActiveTab("analysis")} className="btn-primary">
                      <Crosshair className="h-4 w-4" />
                      Open Analysis
                    </button>
                  </div>
                </Panel>

                <Panel>
                  <SectionHeading icon={<BadgeCheck className="h-5 w-5" />} title="Latest Outcome" subtitle="Most recent AI-assisted screening result." />
                  {latestRecord ? <ResultSummary record={latestRecord} compact /> : <EmptyState text="No diagnosis yet. Complete intake and run analysis to create the first report." />}
                </Panel>
              </div>
            </div>
          )}

          {activeTab === "patient" && (
            <form onSubmit={handleSubmit} className="space-y-4">
              <Panel>
                <SectionHeading icon={<UserRound className="h-5 w-5" />} title="Patient Intake" subtitle="Structured demographic and clinical context for the diagnosis report." />
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <Field label="Full Name" value={patient.fullName} onChange={(value) => updatePatient("fullName", value)} required />
                  <Field label="Age" value={patient.age} onChange={(value) => updatePatient("age", value)} required inputMode="numeric" />
                  <Field label="Gender" value={patient.gender} onChange={(value) => updatePatient("gender", value)} required placeholder="Male / Female / Other" />
                  <Field label="Phone" value={patient.phone} onChange={(value) => updatePatient("phone", value)} required inputMode="tel" />
                  <Field label="Email" value={patient.email} onChange={(value) => updatePatient("email", value)} type="email" />
                  <Field label="Pin Code" value={patient.pinCode} onChange={(value) => updatePatient("pinCode", value)} inputMode="numeric" />
                </div>
                <div className="mt-3 grid gap-3 md:grid-cols-3">
                  <Field label="City" value={patient.city} onChange={(value) => updatePatient("city", value)} required />
                  <Field label="State" value={patient.state} onChange={(value) => updatePatient("state", value)} required />
                  <Field label="Country" value={patient.country} onChange={(value) => updatePatient("country", value)} />
                </div>
                <TextArea label="Address" value={patient.address} onChange={(value) => updatePatient("address", value)} required />
                <TextArea label="Symptoms / Notes" value={patient.symptoms} onChange={(value) => updatePatient("symptoms", value)} />
              </Panel>

              <Panel>
                <SectionHeading icon={<MonitorCog className="h-5 w-5" />} title="Acquisition Details" subtitle="Controls that make the case feel like a real diagnostic workflow." />
                <div className="mt-4 grid gap-3 md:grid-cols-4">
                  <Field label="Sampling Rate" value={acquisition.samplingRate} onChange={(value) => updateAcquisition("samplingRate", value)} />
                  <Field label="Lead" value={acquisition.lead} onChange={(value) => updateAcquisition("lead", value)} />
                  <Field label="Device ID" value={acquisition.deviceId} onChange={(value) => updateAcquisition("deviceId", value)} />
                  <SelectField label="Priority" value={acquisition.priority} onChange={(value) => updateAcquisition("priority", value)} options={["Routine", "Urgent", "Critical"]} />
                  <Field label="Technician" value={acquisition.technician} onChange={(value) => updateAcquisition("technician", value)} />
                </div>
                <div className="mt-3 flex flex-col gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="text-xs text-slate-600">
                    <div className="font-semibold text-slate-900">Location Metadata</div>
                    {patient.latitude && patient.longitude ? (
                      <div>
                        {patient.latitude.toFixed(5)}, {patient.longitude.toFixed(5)}
                      </div>
                    ) : (
                      <div>Use current location or keep address-only records.</div>
                    )}
                  </div>
                  <button type="button" onClick={useCurrentLocation} className="btn-dark">
                    {isLocating ? <Loader2 className="h-4 w-4 animate-spin" /> : <MapPin className="h-4 w-4" />}
                    Use Location
                  </button>
                </div>
              </Panel>
            </form>
          )}

          {activeTab === "analysis" && (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
                <Panel>
                  <SectionHeading icon={<UploadCloud className="h-5 w-5" />} title="ECG Upload" subtitle="Upload raw waveform TXT/CSV data for one diagnostic window." />
                  <label
                    className={
                      requiredPatientFieldsReady
                        ? "mt-4 flex min-h-40 cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-slate-300 bg-slate-50 p-4 text-center transition hover:bg-white"
                        : "mt-4 flex min-h-40 cursor-not-allowed flex-col items-center justify-center rounded-lg border-2 border-dashed border-slate-200 bg-slate-50 p-4 text-center opacity-70"
                    }
                  >
                    <FileText className="h-8 w-8 text-slate-700" />
                    <span className="mt-2 text-xs font-bold text-slate-950">{file ? file.name : "Choose ECG TXT or CSV"}</span>
                    <span className="mt-1 text-xs text-slate-500">Patient required fields must be completed first.</span>
                    <input type="file" accept=".txt,.csv,text/plain,text/csv" disabled={!requiredPatientFieldsReady} onChange={handleFileChange} className="sr-only" />
                  </label>

                  <div className="mt-4 grid grid-cols-3 gap-2">
                    <MiniMetric label="Samples" value={signalValues.length.toString()} />
                    <MiniMetric label="Preview" value={displayedSignal.length ? "500" : "0"} />
                    <MiniMetric label="Quality" value={qualityScore ? `${qualityScore}%` : "--"} />
                  </div>
                </Panel>

                <Panel>
                  <SectionHeading icon={<SlidersHorizontal className="h-5 w-5" />} title="Signal Controls" subtitle="Switch preview modes before sending the raw file to the backend." />
                  <SegmentedControl
                    value={filterMode}
                    onChange={setFilterMode}
                    options={[
                      { value: "raw", label: "Raw" },
                      { value: "smooth", label: "Smooth" },
                      { value: "normalized", label: "Normalized" },
                    ]}
                  />
                  <div className="mt-4">
                    <EcgWaveform values={displayedSignal} />
                  </div>
                </Panel>
              </div>

              <Panel>
                <SectionHeading icon={<Radio className="h-5 w-5" />} title="Run AI Diagnosis" subtitle="Send the uploaded file to FastAPI and save a reportable case." />
                <div className="mt-4 flex flex-col gap-3 lg:flex-row lg:items-end">
                  <Field label="Diagnose URL" value={apiConfig.endpoint} onChange={(value) => setApiConfig((current) => ({ ...current, endpoint: value }))} />
                  <Field label="X-API-Key" value={apiConfig.apiKey} onChange={(value) => setApiConfig((current) => ({ ...current, apiKey: value }))} />
                  <button type="submit" disabled={isSubmitting || !requiredPatientFieldsReady || !file} className="btn-primary h-9 justify-center disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none lg:w-44">
                    {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Crosshair className="h-4 w-4" />}
                    Run Diagnosis
                  </button>
                </div>
              </Panel>
            </form>
          )}

          {activeTab === "insights" && (
            <div className="space-y-4">
              <div className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
                <Panel>
                  <SectionHeading icon={<Gauge className="h-5 w-5" />} title="Signal Quality" subtitle="Quick checks for the currently loaded ECG window." />
                  <div className="mt-4 grid gap-2 sm:grid-cols-2">
                    {signalInsightCards(signalValues, qualityScore).map((item) => (
                      <MiniMetric key={item.label} label={item.label} value={item.value} spacious />
                    ))}
                  </div>
                </Panel>

                <Panel>
                  <SectionHeading icon={<BarChart3 className="h-5 w-5" />} title="Latent Feature Insight" subtitle="Compact explanation of the latest model feature pattern." />
                  {latestRecord ? (
                    <div className="mt-4 space-y-4">
                      <LatentFeatureChart values={latestRecord.latentRepresentation} />
                      <div className="grid gap-2 sm:grid-cols-3">
                        {latentInsightCards(latestRecord.latentRepresentation).map((item) => (
                          <MiniMetric key={item.label} label={item.label} value={item.value} spacious />
                        ))}
                      </div>
                    </div>
                  ) : (
                    <EmptyState text="Run a diagnosis to view latent feature insight." />
                  )}
                </Panel>
              </div>

              <Panel>
                <SectionHeading icon={<ClipboardList className="h-5 w-5" />} title="Case Readiness" subtitle="Useful operational checks before report download." />
                <div className="mt-4 grid gap-2 md:grid-cols-4">
                  <ReadinessCard label="Patient Intake" ready={requiredPatientFieldsReady} detail={requiredPatientFieldsReady ? "Complete" : "Required fields pending"} />
                  <ReadinessCard label="ECG File" ready={Boolean(file)} detail={file?.name || "No file selected"} />
                  <ReadinessCard label="Backend Result" ready={Boolean(latestRecord)} detail={latestRecord?.diagnosis || "No diagnosis yet"} />
                  <ReadinessCard label="Report Options" ready={includeLatents || includePatientNotes} detail={reportFormat === "clinical" ? "Clinical format" : "Technical format"} />
                </div>
              </Panel>
            </div>
          )}

          {activeTab === "reports" && (
            <div className="space-y-4">
              <div className="grid items-start gap-4 xl:grid-cols-[280px_minmax(0,1fr)]">
                <Panel compact>
                  <SectionHeading icon={<FileText className="h-5 w-5" />} title="Report Builder" subtitle="Download a neat clinical report after diagnosis." />
                  <div className="mt-4 space-y-3">
                    <SegmentedControl
                      value={reportFormat}
                      onChange={setReportFormat}
                      options={[
                        { value: "clinical", label: "Clinical" },
                        { value: "technical", label: "Technical" },
                      ]}
                    />
                    <ToggleRow label="Include latent features" checked={includeLatents} onChange={setIncludeLatents} />
                    <ToggleRow label="Include patient notes" checked={includePatientNotes} onChange={setIncludePatientNotes} />
                    <button type="button" onClick={() => exportReport("pdf")} disabled={!latestRecord} className="btn-primary w-full justify-center disabled:cursor-not-allowed disabled:bg-slate-300">
                      <Download className="h-4 w-4" />
                      Download PDF Report
                    </button>
                    <div className="grid grid-cols-2 gap-2">
                      <button type="button" onClick={() => exportReport("csv")} disabled={!latestRecord} className="btn-secondary justify-center disabled:cursor-not-allowed disabled:opacity-50">
                        CSV
                      </button>
                      <button type="button" onClick={() => exportReport("json")} disabled={!latestRecord} className="btn-secondary justify-center disabled:cursor-not-allowed disabled:opacity-50">
                        JSON
                      </button>
                    </div>
                  </div>
                </Panel>

                <Panel compact>
                  <SectionHeading icon={<CheckCircle2 className="h-5 w-5" />} title="Report Preview" subtitle="Latest outcome summary." />
                  {latestRecord ? (
                    <ReportDocument record={latestRecord} format={reportFormat} includeLatents={includeLatents} includeNotes={includePatientNotes} />
                  ) : (
                    <EmptyState text="No report available yet. Run a diagnosis first." />
                  )}
                </Panel>
              </div>
            </div>
          )}

          {activeTab === "records" && (
            <div className="space-y-4">
              <Panel>
                <PatientHistory records={history} activeRecord={latestRecord} onSelect={setActiveRecord} />
              </Panel>

              <Panel>
                <HistoryTable
                  records={history}
                  search={historySearch}
                  onSearchChange={setHistorySearch}
                  dateFilter={historyDate}
                  onDateFilterChange={setHistoryDate}
                  diagnosisFilter={historyDiagnosis}
                  onDiagnosisFilterChange={setHistoryDiagnosis}
                  priorityFilter={historyPriority}
                  onPriorityFilterChange={setHistoryPriority}
                  onSelect={setActiveRecord}
                  onDownload={downloadReport}
                  onExport={exportReport}
                />
              </Panel>
            </div>
          )}

          {activeTab === "settings" && (
            <Panel>
              <SectionHeading icon={<Settings className="h-5 w-5" />} title="FastAPI Configuration" subtitle="Backend connection and report defaults." />
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <Field label="Diagnose URL" value={apiConfig.endpoint} onChange={(value) => setApiConfig((current) => ({ ...current, endpoint: value }))} />
                <Field label="X-API-Key" value={apiConfig.apiKey} onChange={(value) => setApiConfig((current) => ({ ...current, apiKey: value }))} />
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <button type="button" onClick={() => setApiConfig(DEFAULT_API_CONFIG)} className="btn-secondary">
                  Reset API Defaults
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setHistory([]);
                    setActiveRecord(null);
                    localStorage.removeItem(HISTORY_KEY);
                  }}
                  className="btn-danger"
                >
                  Clear Local Reports
                </button>
              </div>
            </Panel>
          )}
        </section>
      </div>
    </main>
  );
}

function Panel({ children, compact = false }: { children: React.ReactNode; compact?: boolean }) {
  return <section className={compact ? "rounded-lg border border-slate-200 bg-white p-4 shadow-panel" : "rounded-lg border border-slate-200 bg-white p-4 shadow-panel"}>{children}</section>;
}

function SectionHeading({ icon, title, subtitle }: { icon: React.ReactNode; title: string; subtitle: string }) {
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-700">{icon}</div>
      <div className="min-w-0">
        <h2 className="truncate text-base font-bold text-slate-950">{title}</h2>
        <p className="truncate text-xs text-slate-500">{subtitle}</p>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  required,
  placeholder,
  type = "text",
  inputMode,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  placeholder?: string;
  type?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
}) {
  return (
    <label className="block w-full">
      <span className="text-xs font-semibold text-slate-700">
        {label} {required && <span className="text-red-600">*</span>}
      </span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        required={required}
        type={type}
        inputMode={inputMode}
        placeholder={placeholder}
        className="mt-1 h-9 w-full rounded-md border border-slate-200 bg-slate-50 px-3 text-xs outline-none ring-slate-500 transition focus:bg-white focus:ring-2"
      />
    </label>
  );
}

function TextArea({ label, value, onChange, required }: { label: string; value: string; onChange: (value: string) => void; required?: boolean }) {
  return (
    <label className="mt-4 block">
      <span className="text-xs font-semibold text-slate-700">
        {label} {required && <span className="text-red-600">*</span>}
      </span>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        required={required}
        className="mt-1 min-h-20 w-full rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs outline-none ring-slate-500 transition focus:bg-white focus:ring-2"
      />
    </label>
  );
}

function SelectField({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: string[] }) {
  return (
    <label className="block">
      <span className="text-xs font-semibold text-slate-700">{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)} className="mt-1 h-9 w-full rounded-md border border-slate-200 bg-slate-50 px-3 text-xs outline-none ring-slate-500 focus:bg-white focus:ring-2">
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

function SegmentedControl<T extends string>({ value, onChange, options }: { value: T; onChange: (value: T) => void; options: { value: T; label: string }[] }) {
  return (
    <div className="grid rounded-lg border border-slate-200 bg-slate-100 p-1" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
      {options.map((option) => (
        <button key={option.value} type="button" onClick={() => onChange(option.value)} className={value === option.value ? "rounded-md bg-white px-3 py-1.5 text-xs font-bold text-slate-950 shadow-sm" : "rounded-md px-3 py-1.5 text-xs font-bold text-slate-500 transition hover:text-slate-950"}>
          {option.label}
        </button>
      ))}
    </div>
  );
}

function ToggleRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 p-2.5 text-xs font-semibold text-slate-700">
      {label}
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="h-4 w-4 accent-slate-800" />
    </label>
  );
}

function MetricPill({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/10 px-3 py-1.5">
      <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase text-slate-300">{icon}{label}</div>
      <div className="text-xs font-bold text-white">{value}</div>
    </div>
  );
}

function StatCard({ label, value, helper, tone }: { label: string; value: string; helper: string; tone: "slate" | "green" | "red" | "blue" }) {
  const toneClass = {
    slate: "border-slate-300 bg-white text-slate-900",
    green: "border-emerald-200 bg-emerald-50 text-slate-900",
    red: "border-red-200 bg-red-50 text-slate-900",
    blue: "border-blue-200 bg-blue-50 text-slate-900",
  };
  return (
    <div className={`rounded-lg border p-4 shadow-sm ${toneClass[tone]}`}>
      <div className="text-xs font-semibold text-slate-500">{label}</div>
      <div className="mt-1 truncate text-xl font-black text-slate-950">{value}</div>
      <div className="mt-1 truncate text-[11px] font-medium text-slate-500">{helper}</div>
    </div>
  );
}

function MiniMetric({ label, value, spacious = false }: { label: string; value: string; spacious?: boolean }) {
  return (
    <div className={spacious ? "min-h-20 min-w-0 rounded-lg border border-slate-200 bg-slate-50 p-3" : "min-w-0 rounded-lg border border-slate-200 bg-slate-50 p-2.5"}>
      <div className="text-[11px] font-bold uppercase text-slate-500">{label}</div>
      <div
        title={value}
        className={
          spacious
            ? "mt-1.5 max-w-full truncate whitespace-nowrap text-lg font-black leading-tight text-slate-950"
            : "mt-1 max-w-full truncate whitespace-nowrap text-base font-black leading-tight text-slate-950"
        }
      >
        {value}
      </div>
    </div>
  );
}

function WorkflowStep({ done, label }: { done: boolean; label: string }) {
  return (
    <div className="mt-2 flex items-center gap-2 text-xs text-slate-700">
      <span className={done ? "h-2.5 w-2.5 rounded-full bg-emerald-500" : "h-2.5 w-2.5 rounded-full bg-slate-300"} />
      {label}
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return <div className="mt-4 rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4 text-center text-xs font-medium text-slate-500">{text}</div>;
}

function ResultSummary({ record, compact = false }: { record: HistoryRecord; compact?: boolean }) {
  const isNormal = record.diagnosis === "Normal";
  return (
    <div className="mt-4 space-y-3">
      <div className={isNormal ? "rounded-lg border border-emerald-200 bg-emerald-50 p-4" : "rounded-lg border border-red-200 bg-red-50 p-4"}>
        <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-center">
          <div className="flex min-w-0 items-center gap-2.5">
            <CheckCircle2 className={isNormal ? "h-5 w-5 shrink-0 text-emerald-700" : "h-5 w-5 shrink-0 text-red-700"} />
            <div className="min-w-0">
              <div className="text-xs font-semibold text-slate-600">Screening Result</div>
              <div className={isNormal ? "truncate text-xl font-black leading-tight text-emerald-800" : "truncate text-xl font-black leading-tight text-red-800"}>{record.diagnosis}</div>
            </div>
          </div>
          <div className="max-w-full truncate rounded-md border border-slate-200 bg-white/70 px-2.5 py-1.5 text-left text-[11px] font-bold uppercase text-slate-500 sm:max-w-36 sm:text-right">
            {record.reportId || "ECG Report"}
          </div>
        </div>
      </div>
      <div className={compact ? "grid gap-3 sm:grid-cols-3" : "grid gap-3 sm:grid-cols-2 xl:grid-cols-3"}>
        <MiniMetric label="Patient" value={record.patient.fullName || "Patient"} spacious />
        <MiniMetric label="Samples" value={record.sampleCount.toString()} spacious />
        <MiniMetric label="Created" value={new Date(record.createdAt).toLocaleDateString()} spacious />
      </div>
      {!compact && (
        <>
          <LatentFeatureChart values={record.latentRepresentation} />
        </>
      )}
    </div>
  );
}

function ReadinessCard({ label, ready, detail }: { label: string; ready: boolean; detail: string }) {
  return (
    <div className={ready ? "rounded-lg border border-emerald-200 bg-emerald-50 p-3" : "rounded-lg border border-slate-200 bg-slate-50 p-3"}>
      <div className="flex items-center gap-2 text-xs font-bold text-slate-950">
        <span className={ready ? "h-2.5 w-2.5 rounded-full bg-emerald-500" : "h-2.5 w-2.5 rounded-full bg-slate-300"} />
        {label}
      </div>
      <div className="mt-1.5 truncate text-xs font-medium text-slate-600" title={detail}>
        {detail}
      </div>
    </div>
  );
}

function ReportDocument({
  record,
  format,
  includeLatents,
  includeNotes,
}: {
  record: HistoryRecord;
  format: ReportFormat;
  includeLatents: boolean;
  includeNotes: boolean;
}) {
  const isNormal = record.diagnosis === "Normal";
  const acquisition = record.acquisition;
  const infoBoxes = reportInfoBoxes(record);
  const analysis = reportAnalysisRows(record);

  return (
    <article className="mt-4 overflow-hidden rounded-lg border border-slate-200 bg-white text-slate-900">
      <header className="bg-blue-800 px-5 py-4 text-white">
        <h3 className="text-lg font-bold">ECG REPORT</h3>
        <p className="mt-1 truncate text-xs text-slate-300">
          {record.reportId || "ECG Report"} | Generated {new Date(record.createdAt).toLocaleString()}
        </p>
      </header>
      <div className="p-5">
        <div className={isNormal ? "rounded-lg border-2 border-emerald-700 p-3.5 text-emerald-700" : "rounded-lg border-2 border-red-700 p-3.5 text-red-700"}>
          <div className="text-[11px] font-bold uppercase text-slate-500">Screening Outcome</div>
          <strong className="mt-1 block text-xl leading-none">{record.diagnosis}</strong>
        </div>

        <div className="mt-4 grid gap-2 md:grid-cols-2">
          {infoBoxes.map((item) => (
            <div key={item.label} className="min-w-0 rounded-lg border border-slate-200 bg-slate-50 p-3">
              <div className="text-[11px] font-bold uppercase text-slate-500">{item.label}</div>
              <div className="mt-1 truncate text-sm font-bold text-slate-950" title={item.value}>
                {item.value}
              </div>
            </div>
          ))}
        </div>

        {includeNotes && (
          <div className="mt-4 border-l-4 border-cyan-600 bg-cyan-50 p-3 text-xs text-cyan-900">
            <strong>Symptoms / Notes</strong>
            <div className="mt-1">{record.patient.symptoms || "No notes entered."}</div>
          </div>
        )}

        <h4 className="mt-5 text-base font-bold text-slate-950">ECG Analysis</h4>
        <div className="mt-2 grid gap-2 md:grid-cols-2">
          {analysis.map((item) => (
            <div key={item.label} className="rounded-lg border border-slate-200 bg-white p-3">
              <div className="text-[11px] font-bold uppercase text-slate-500">{item.label}</div>
              <div className="mt-1 truncate text-sm font-bold text-slate-950" title={item.value}>
                {item.value}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-3 grid gap-2 md:grid-cols-2">
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <div className="text-[11px] font-bold uppercase text-slate-500">Sampling Setup</div>
            <div className="mt-1 truncate text-xs font-semibold text-slate-700">
              {(acquisition?.samplingRate || "-")} | {(acquisition?.lead || "-")} | {(acquisition?.deviceId || "-")}
            </div>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <div className="text-[11px] font-bold uppercase text-slate-500">Report Mode</div>
            <div className="mt-1 truncate text-xs font-semibold text-slate-700">{format === "technical" ? "Technical feature report" : "Clinical summary report"}</div>
          </div>
        </div>

        {includeLatents && (
          <>
            <h4 className="mt-5 text-base font-bold text-slate-950">{format === "technical" ? "Latent Feature Representation" : "Explainability Features"}</h4>
            <div className="mt-2 overflow-hidden rounded-lg border border-slate-200">
              <table className="w-full border-collapse text-xs">
                <thead className="bg-slate-50 text-left text-[11px] uppercase text-slate-500">
                  <tr>
                    <th className="border-b border-slate-200 px-3 py-2">Feature</th>
                    <th className="border-b border-slate-200 px-3 py-2">Value</th>
                    <th className="border-b border-slate-200 px-3 py-2">Direction</th>
                  </tr>
                </thead>
                <tbody>
                  {record.latentRepresentation.map((value, index) => (
                    <tr key={`${index}-${value}`}>
                      <td className="border-b border-slate-100 px-3 py-2 font-semibold">L{index + 1}</td>
                      <td className="border-b border-slate-100 px-3 py-2 font-mono">{value.toFixed(6)}</td>
                      <td className="border-b border-slate-100 px-3 py-2">{value >= 0 ? "Positive" : "Negative"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </article>
  );
}

function HistoryTable({
  records,
  search,
  onSearchChange,
  dateFilter,
  onDateFilterChange,
  diagnosisFilter,
  onDiagnosisFilterChange,
  priorityFilter,
  onPriorityFilterChange,
  onSelect,
  onDownload,
  onExport,
}: {
  records: HistoryRecord[];
  search: string;
  onSearchChange: (value: string) => void;
  dateFilter: string;
  onDateFilterChange: (value: string) => void;
  diagnosisFilter: DiagnosisFilter;
  onDiagnosisFilterChange: (value: DiagnosisFilter) => void;
  priorityFilter: PriorityFilter;
  onPriorityFilterChange: (value: PriorityFilter) => void;
  onSelect: (record: HistoryRecord) => void;
  onDownload: (record: HistoryRecord) => void;
  onExport: (format: ExportFormat, record: HistoryRecord) => void;
}) {
  const filtered = records.filter((record) => {
    const query = search.trim().toLowerCase();
    const matchesText =
      !query ||
      record.patient.fullName.toLowerCase().includes(query) ||
      record.reportId?.toLowerCase().includes(query) ||
      record.fileName.toLowerCase().includes(query);
    const matchesDate = !dateFilter || record.createdAt.slice(0, 10) === dateFilter;
    const matchesDiagnosis = diagnosisFilter === "All" || record.diagnosis === diagnosisFilter;
    const matchesPriority = priorityFilter === "All" || record.acquisition?.priority === priorityFilter;
    return matchesText && matchesDate && matchesDiagnosis && matchesPriority;
  });

  return (
    <div>
      <SectionHeading icon={<History className="h-5 w-5" />} title="Report History" subtitle="Search and filter saved reports." />
      <div className="mt-4 grid gap-2 md:grid-cols-[minmax(180px,1fr)_150px_150px_150px]">
        <label className="relative block w-full">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input value={search} onChange={(event) => onSearchChange(event.target.value)} className="h-9 w-full rounded-md border border-slate-200 bg-slate-50 pl-9 pr-3 text-xs outline-none ring-slate-500 focus:ring-2" placeholder="Search patient, report, file" />
        </label>
        <input type="date" value={dateFilter} onChange={(event) => onDateFilterChange(event.target.value)} className="h-9 rounded-md border border-slate-200 bg-slate-50 px-3 text-xs outline-none ring-slate-500 focus:ring-2" />
        <select value={diagnosisFilter} onChange={(event) => onDiagnosisFilterChange(event.target.value as DiagnosisFilter)} className="h-9 rounded-md border border-slate-200 bg-slate-50 px-3 text-xs outline-none ring-slate-500 focus:ring-2">
          {["All", "Normal", "Abnormal"].map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
        <select value={priorityFilter} onChange={(event) => onPriorityFilterChange(event.target.value as PriorityFilter)} className="h-9 rounded-md border border-slate-200 bg-slate-50 px-3 text-xs outline-none ring-slate-500 focus:ring-2">
          {["All", "Routine", "Urgent", "Critical"].map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </div>
      <div className="mt-4 overflow-hidden rounded-lg border border-slate-200">
        {filtered.length === 0 ? (
          <EmptyState text="No report records found." />
        ) : (
          filtered.map((record) => (
            <article key={record.id} className="grid gap-3 border-b border-slate-200 bg-white p-3 last:border-b-0 md:grid-cols-[1fr_auto] md:items-center">
              <button type="button" onClick={() => onSelect(record)} className="text-left">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-sm font-bold text-slate-950">{record.patient.fullName}</h3>
                  <span className={record.diagnosis === "Normal" ? "rounded-full bg-emerald-100 px-2 py-1 text-xs font-bold text-emerald-700" : "rounded-full bg-red-100 px-2 py-1 text-xs font-bold text-red-700"}>
                    {record.diagnosis}
                  </span>
                  <span className="rounded-full bg-slate-100 px-2 py-1 text-[11px] font-bold text-slate-600">{record.acquisition?.priority || "Routine"}</span>
                </div>
                <div className="mt-1 flex flex-wrap gap-3 text-xs text-slate-500">
                  <span>{record.reportId}</span>
                  <span>{record.fileName}</span>
                  <span>{new Date(record.createdAt).toLocaleString()}</span>
                </div>
              </button>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => onDownload(record)} className="btn-secondary justify-center">
                  <Download className="h-4 w-4" />
                  PDF
                </button>
                <button type="button" onClick={() => onExport("csv", record)} className="btn-secondary justify-center">
                  CSV
                </button>
                <button type="button" onClick={() => onExport("json", record)} className="btn-secondary justify-center">
                  JSON
                </button>
              </div>
            </article>
          ))
        )}
      </div>
    </div>
  );
}

function PatientHistory({ records, activeRecord, onSelect }: { records: HistoryRecord[]; activeRecord: HistoryRecord | null; onSelect: (record: HistoryRecord) => void }) {
  if (!activeRecord) {
    return (
      <div>
        <SectionHeading icon={<ClipboardList className="h-5 w-5" />} title="Patient History" subtitle="Previous reports for the selected patient." />
        <EmptyState text="Select or create a report to view patient history." />
      </div>
    );
  }

  const patientReports = records
    .filter((record) => samePatient(record, activeRecord))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const previous = patientReports.find((record) => record.id !== activeRecord.id) || null;

  return (
    <div>
      <SectionHeading icon={<ClipboardList className="h-5 w-5" />} title="Patient History" subtitle={`Previous reports for ${activeRecord.patient.fullName || "selected patient"}.`} />
      <div className="mt-4 grid gap-3 md:grid-cols-4">
        <MiniMetric label="Patient Reports" value={patientReports.length.toString()} spacious />
        <MiniMetric label="Latest Result" value={activeRecord.diagnosis} spacious />
        <MiniMetric label="Previous Result" value={previous?.diagnosis || "--"} spacious />
        <MiniMetric label="Last Visit" value={previous ? new Date(previous.createdAt).toLocaleDateString() : "--"} spacious />
      </div>
      <div className="mt-4 overflow-hidden rounded-lg border border-slate-200">
        {patientReports.map((record) => (
          <button
            key={record.id}
            type="button"
            onClick={() => onSelect(record)}
            className={record.id === activeRecord.id ? "grid w-full gap-2 border-b border-slate-200 bg-blue-50 p-3 text-left last:border-b-0 md:grid-cols-[1fr_auto]" : "grid w-full gap-2 border-b border-slate-200 bg-white p-3 text-left transition hover:bg-slate-50 last:border-b-0 md:grid-cols-[1fr_auto]"}
          >
            <span>
              <span className="block text-sm font-bold text-slate-950">{record.reportId || "ECG Report"}</span>
              <span className="mt-1 block text-xs text-slate-500">{new Date(record.createdAt).toLocaleString()} | {record.fileName}</span>
            </span>
            <span className={record.diagnosis === "Normal" ? "h-fit rounded-full bg-emerald-100 px-2 py-1 text-xs font-bold text-emerald-700" : "h-fit rounded-full bg-red-100 px-2 py-1 text-xs font-bold text-red-700"}>
              {record.diagnosis}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function transformSignal(values: number[], mode: FilterMode) {
  if (mode === "raw" || values.length === 0) return values;
  if (mode === "normalized") {
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;
    return values.map((value) => (value - min) / range);
  }
  return values.map((value, index) => {
    const prev = values[Math.max(0, index - 1)];
    const next = values[Math.min(values.length - 1, index + 1)];
    return (prev + value + next) / 3;
  });
}

function signalInsightCards(values: number[], qualityScore: number) {
  const stats = calculateStats(values);
  return [
    { label: "Loaded Samples", value: values.length ? values.length.toString() : "0" },
    { label: "Model Window", value: values.length >= 500 ? "500 samples" : "Pending" },
    { label: "Signal Quality", value: qualityScore ? `${qualityScore}%` : "--" },
    { label: "Amplitude Range", value: stats ? stats.range.toFixed(3) : "--" },
    { label: "Mean", value: stats ? stats.mean.toFixed(3) : "--" },
    { label: "Std Dev", value: stats ? stats.stdDev.toFixed(3) : "--" },
  ];
}

function latentInsightCards(values: number[]) {
  const analysis = analyzeLatents(values);
  return [
    { label: "Strongest Feature", value: analysis.strongestFeature },
    { label: "Mean Activation", value: analysis.meanAbs.toFixed(3) },
    { label: "Positive / Negative", value: `${analysis.positiveCount} / ${analysis.negativeCount}` },
  ];
}

function reportInfoBoxes(record: HistoryRecord) {
  const acquisition = record.acquisition;
  return [
    { label: "Patient", value: record.patient.fullName || "-" },
    { label: "Age / Gender", value: `${record.patient.age || "-"} / ${record.patient.gender || "-"}` },
    { label: "Phone", value: record.patient.phone || "-" },
    { label: "Location", value: [record.patient.city, record.patient.state, record.patient.country].filter(Boolean).join(", ") || "-" },
    { label: "File", value: record.fileName || "-" },
    { label: "Samples", value: record.sampleCount.toString() },
    { label: "Lead", value: acquisition?.lead || "-" },
    { label: "Priority", value: acquisition?.priority || "-" },
  ];
}

function reportAnalysisRows(record: HistoryRecord) {
  const latent = analyzeLatents(record.latentRepresentation);
  return [
    { label: "Model Window", value: `${Math.min(record.sampleCount, 500)} samples analyzed` },
    { label: "Feature Count", value: `${record.latentRepresentation.length} latent dimensions` },
    { label: "Strongest Latent", value: latent.strongestFeature },
    { label: "Mean Activation", value: latent.meanAbs.toFixed(6) },
    { label: "Positive Features", value: latent.positiveCount.toString() },
    { label: "Negative Features", value: latent.negativeCount.toString() },
  ];
}

function samePatient(a: HistoryRecord, b: HistoryRecord) {
  const aName = a.patient.fullName.trim().toLowerCase();
  const bName = b.patient.fullName.trim().toLowerCase();
  const aPhone = a.patient.phone.trim();
  const bPhone = b.patient.phone.trim();
  return Boolean((aPhone && aPhone === bPhone) || (aName && aName === bName));
}

function reportFileBaseName(record: HistoryRecord) {
  return `${record.reportId || "ecg-report"}-${record.patient.fullName || "patient"}`;
}

function buildReportJson(record: HistoryRecord) {
  return {
    reportId: record.reportId || "ECG Report",
    createdAt: record.createdAt,
    diagnosis: record.diagnosis,
    patient: record.patient,
    acquisition: record.acquisition,
    file: {
      name: record.fileName,
      type: record.fileType,
      sampleCount: record.sampleCount,
    },
    analysis: reportAnalysisRows(record).reduce<Record<string, string>>((acc, item) => {
      acc[item.label] = item.value;
      return acc;
    }, {}),
    latentRepresentation: record.latentRepresentation,
  };
}

function buildReportCsv(record: HistoryRecord) {
  const rows = [
    ["Report ID", record.reportId || "ECG Report"],
    ["Created At", new Date(record.createdAt).toLocaleString()],
    ["Diagnosis", record.diagnosis],
    ["Patient", record.patient.fullName || "-"],
    ["Age", record.patient.age || "-"],
    ["Gender", record.patient.gender || "-"],
    ["Phone", record.patient.phone || "-"],
    ["Location", [record.patient.city, record.patient.state, record.patient.country].filter(Boolean).join(", ") || "-"],
    ["File", record.fileName],
    ["Samples", record.sampleCount.toString()],
    ["Sampling Rate", record.acquisition?.samplingRate || "-"],
    ["Lead", record.acquisition?.lead || "-"],
    ["Device ID", record.acquisition?.deviceId || "-"],
    ["Technician", record.acquisition?.technician || "-"],
    ["Priority", record.acquisition?.priority || "-"],
    ["Symptoms / Notes", record.patient.symptoms || "-"],
    ...reportAnalysisRows(record).map((item) => [item.label, item.value]),
    ...record.latentRepresentation.map((value, index) => [`L${index + 1}`, value.toFixed(6)]),
  ];

  return rows.map((row) => row.map(csvEscape).join(",")).join("\n");
}

function csvEscape(value: string) {
  return `"${value.replace(/"/g, '""')}"`;
}

function calculateStats(values: number[]) {
  if (!values.length) return null;
  const usable = values.slice(0, 500);
  const min = Math.min(...usable);
  const max = Math.max(...usable);
  const mean = usable.reduce((sum, value) => sum + value, 0) / usable.length;
  const variance = usable.reduce((sum, value) => sum + Math.pow(value - mean, 2), 0) / usable.length;
  return {
    min,
    max,
    mean,
    range: max - min,
    stdDev: Math.sqrt(variance),
  };
}

function analyzeLatents(values: number[]) {
  if (!values.length) {
    return {
      strongestFeature: "--",
      meanAbs: 0,
      positiveCount: 0,
      negativeCount: 0,
    };
  }

  let strongestIndex = 0;
  values.forEach((value, index) => {
    if (Math.abs(value) > Math.abs(values[strongestIndex])) strongestIndex = index;
  });

  return {
    strongestFeature: `L${strongestIndex + 1} (${values[strongestIndex].toFixed(3)})`,
    meanAbs: values.reduce((sum, value) => sum + Math.abs(value), 0) / values.length,
    positiveCount: values.filter((value) => value >= 0).length,
    negativeCount: values.filter((value) => value < 0).length,
  };
}

function buildReportPdf(record: HistoryRecord, format: ReportFormat, includeLatents: boolean, includeNotes: boolean) {
  const pageWidth = 612;
  const pageHeight = 792;
  const margin = 54;
  const pageX = 36;
  const pageTop = 28;
  const pageInnerWidth = pageWidth - pageX * 2;
  const footerTop = 742;
  const blue = "0.055 0.302 0.573";
  const content: string[] = [
    "0.945 0.961 0.976 rg 0 0 612 792 re f",
    "1 1 1 rg 36 32 540 728 re f",
    "0.82 0.86 0.91 RG 36 32 540 728 re S",
  ];
  const resultColor = record.diagnosis === "Normal" ? "0.016 0.471 0.341" : "0.745 0.071 0.235";
  let y = 118;

  function pdfY(top: number, height = 0) {
    return pageHeight - top - height;
  }

  function addText(text: string, x: number, baselineTop: number, options?: { size?: number; bold?: boolean; color?: string; maxWidth?: number; lineHeight?: number }) {
    const size = options?.size || 11;
    const font = options?.bold ? "F2" : "F1";
    const color = options?.color || "0.059 0.09 0.165";
    const lineHeight = options?.lineHeight || size + 5;
    const safeText = options?.maxWidth ? truncatePdfText(text, Math.max(10, Math.floor(options.maxWidth / (size * 0.5)))) : text;
    const lines = options?.maxWidth ? wrapPdfLine(safeText, Math.max(8, Math.floor(options.maxWidth / (size * 0.52)))) : [safeText];
    lines.forEach((line, index) => {
      content.push(`${color} rg BT /${font} ${size} Tf ${x} ${pageHeight - baselineTop - index * lineHeight} Td (${escapePdfText(line)}) Tj ET`);
    });
    return baselineTop + lines.length * lineHeight;
  }

  function addBox(x: number, top: number, width: number, height: number, fill = "0.973 0.98 0.988", stroke = "0.886 0.91 0.941") {
    content.push(`${fill} rg ${x} ${pdfY(top, height)} ${width} ${height} re f`);
    content.push(`${stroke} RG ${x} ${pdfY(top, height)} ${width} ${height} re S`);
  }

  function addSection(title: string, top: number) {
    addText(title, margin, top + 11, { size: 10, bold: true, color: blue });
    content.push(`0.82 0.86 0.91 RG ${margin} ${pdfY(top + 17, 0)} ${pageWidth - margin * 2} 0.6 re S`);
    return top + 24;
  }

  function addKeyValueGrid(items: { label: string; value: string }[], top: number) {
    const gap = 10;
    const boxWidth = (pageWidth - margin * 2 - gap) / 2;
    const boxHeight = 30;
    const rowGap = 6;
    items.forEach((item, index) => {
      const col = index % 2;
      const row = Math.floor(index / 2);
      const x = margin + col * (boxWidth + gap);
      const boxTop = top + row * (boxHeight + rowGap);
      addBox(x, boxTop, boxWidth, boxHeight);
      addText(item.label.toUpperCase(), x + 10, boxTop + 11, { size: 6.5, bold: true, color: "0.392 0.455 0.545" });
      addText(item.value || "-", x + 10, boxTop + 24, { size: 8.5, bold: true, maxWidth: boxWidth - 20 });
    });
    return top + Math.ceil(items.length / 2) * (boxHeight + rowGap);
  }

  content.push(`${blue} rg ${pageX} ${pdfY(pageTop, 64)} ${pageInnerWidth} 64 re f`);
  addText("ECG REPORT", margin, 61, { size: 22, bold: true, color: "1 1 1" });
  addText(`${record.reportId || "ECG Report"} | Generated ${new Date(record.createdAt).toLocaleString()}`, margin, 82, { size: 8.5, color: "0.86 0.91 0.96" });

  addBox(margin, y, pageWidth - margin * 2, 38, record.diagnosis === "Normal" ? "0.925 0.98 0.949" : "0.996 0.91 0.91", resultColor);
  addText("SCREENING OUTCOME", margin + 14, y + 13, { size: 7, bold: true, color: "0.392 0.455 0.545" });
  addText(record.diagnosis, margin + 14, y + 31, { size: 17, bold: true, color: resultColor });

  y = addSection("Patient And Recording Details", y + 54);
  y = addKeyValueGrid(reportInfoBoxes(record), y);

  if (includeNotes) {
    y += 8;
    addBox(margin, y, pageWidth - margin * 2, 30, "0.925 0.984 0.992", "0.033 0.569 0.706");
    addText("SYMPTOMS / NOTES", margin + 12, y + 11, { size: 7, bold: true, color: "0.086 0.306 0.388" });
    addText(record.patient.symptoms || "No notes entered.", margin + 12, y + 24, { size: 8.5, color: "0.086 0.306 0.388", maxWidth: pageWidth - margin * 2 - 24 });
    y += 42;
  }

  y = addSection("ECG Analysis", y + 6);
  y = addKeyValueGrid(reportAnalysisRows(record), y);

  const acquisition = record.acquisition;
  y = addSection("Acquisition Summary", y + 6);
  y = addKeyValueGrid(
    [
      { label: "Sampling Setup", value: `${acquisition?.samplingRate || "-"} | ${acquisition?.lead || "-"} | ${acquisition?.deviceId || "-"}` },
      { label: "Report Mode", value: format === "technical" ? "Technical feature report" : "Clinical summary report" },
    ],
    y,
  );

  if (includeLatents) {
    y = addSection(format === "technical" ? "Latent Feature Representation" : "Explainability Features", y + 6);
    const tableX = margin;
    const tableWidth = pageWidth - margin * 2;
    const rowHeight = 13;
    addBox(tableX, y, tableWidth, rowHeight, "0.973 0.98 0.988");
    addText("FEATURE", tableX + 10, y + 9, { size: 6.5, bold: true, color: "0.392 0.455 0.545" });
    addText("VALUE", tableX + 150, y + 9, { size: 6.5, bold: true, color: "0.392 0.455 0.545" });
    addText("DIRECTION", tableX + 320, y + 9, { size: 6.5, bold: true, color: "0.392 0.455 0.545" });
    y += rowHeight;
    record.latentRepresentation.forEach((value, index) => {
      addText(`L${index + 1}`, tableX + 10, y + 9, { size: 7.2, bold: true });
      addText(value.toFixed(6), tableX + 150, y + 9, { size: 7.2 });
      addText(value >= 0 ? "Positive" : "Negative", tableX + 320, y + 9, { size: 7.2 });
      content.push(`0.886 0.91 0.941 RG ${tableX} ${pageHeight - y - rowHeight} ${tableWidth} 0.5 re S`);
      y += rowHeight;
    });
  }

  content.push(`0.945 0.961 0.976 rg ${pageX} ${pdfY(footerTop, 18)} ${pageInnerWidth} 18 re f`);
  content.push(`0.82 0.86 0.91 RG ${pageX} ${pdfY(footerTop, 18)} ${pageInnerWidth} 18 re S`);
  addText("ECG Diagnostic Report | Confidential Patient Record", margin, footerTop + 12, { size: 7.5, color: "0.392 0.455 0.545" });
  addText(`Report ID: ${record.reportId || "ECG Report"}`, pageWidth - margin - 132, footerTop + 12, { size: 7.5, color: "0.392 0.455 0.545", maxWidth: 132 });
  
  const stream = content.join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
  ];

  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach((offset) => {
    pdf += `${offset.toString().padStart(10, "0")} 00000 n \n`;
  });
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

  return new TextEncoder().encode(pdf);
}

function wrapPdfLine(text: string, maxLength: number) {
  const words = text.split(" ");
  const lines: string[] = [];
  let current = "";
  words.forEach((word) => {
    if (`${current} ${word}`.trim().length > maxLength) {
      if (current) lines.push(current);
      current = word;
    } else {
      current = `${current} ${word}`.trim();
    }
  });
  if (current) lines.push(current);
  return lines;
}

function truncatePdfText(text: string, maxLength: number) {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
}

function escapePdfText(text: string) {
  return text.replace(/[^\x20-\x7E]/g, " ").replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function unusedLegacyReportTemplate(record: HistoryRecord, format: ReportFormat, includeLatents: boolean, includeNotes: boolean) {
  const riskColor = record.diagnosis === "Normal" ? "#047857" : "#be123c";
  const latentRows = record.latentRepresentation
    .map((value, index) => `<tr><td>L${index + 1}</td><td>${value.toFixed(6)}</td></tr>`)
    .join("");
  const acquisition = record.acquisition;

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${record.reportId || "ECG Report"}</title>
  <style>
    body { margin: 0; background: #f1f5f9; color: #0f172a; font-family: Arial, sans-serif; }
    .page { max-width: 900px; margin: 24px auto; background: white; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; }
    .header { background: #0f172a; color: white; padding: 28px; }
    .header h1 { margin: 0; font-size: 26px; }
    .header p { margin: 8px 0 0; color: #cbd5e1; }
    .content { padding: 28px; }
    .grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
    .box { border: 1px solid #e2e8f0; border-radius: 10px; padding: 16px; background: #f8fafc; }
    .label { color: #64748b; font-size: 12px; font-weight: 700; text-transform: uppercase; }
    .value { margin-top: 4px; font-size: 16px; font-weight: 700; }
    .result { border: 2px solid ${riskColor}; color: ${riskColor}; border-radius: 12px; padding: 20px; margin: 20px 0; }
    .result strong { font-size: 30px; display: block; margin-top: 6px; }
    table { width: 100%; border-collapse: collapse; margin-top: 12px; }
    th, td { border-bottom: 1px solid #e2e8f0; padding: 10px; text-align: left; font-size: 14px; }
    .note { margin-top: 20px; padding: 16px; border-left: 4px solid #0891b2; background: #ecfeff; color: #164e63; }
    @media print { body { background: white; } .page { margin: 0; border: 0; } }
  </style>
</head>
<body>
  <main class="page">
    <section class="header">
      <h1>Explainable ECG Diagnostic Report</h1>
      <p>${record.reportId || "ECG Report"} | Generated ${new Date(record.createdAt).toLocaleString()}</p>
    </section>
    <section class="content">
      <div class="result">
        <span class="label">Screening Outcome</span>
        <strong>${record.diagnosis}</strong>
      </div>
      <div class="grid">
        <div class="box"><div class="label">Patient</div><div class="value">${record.patient.fullName || "-"}</div></div>
        <div class="box"><div class="label">Age / Gender</div><div class="value">${record.patient.age || "-"} / ${record.patient.gender || "-"}</div></div>
        <div class="box"><div class="label">Phone</div><div class="value">${record.patient.phone || "-"}</div></div>
        <div class="box"><div class="label">Location</div><div class="value">${[record.patient.city, record.patient.state, record.patient.country].filter(Boolean).join(", ") || "-"}</div></div>
        <div class="box"><div class="label">File</div><div class="value">${record.fileName}</div></div>
        <div class="box"><div class="label">Samples</div><div class="value">${record.sampleCount}</div></div>
        <div class="box"><div class="label">Lead</div><div class="value">${acquisition?.lead || "-"}</div></div>
        <div class="box"><div class="label">Priority</div><div class="value">${acquisition?.priority || "-"}</div></div>
      </div>
      ${
        includeNotes
          ? `<div class="note"><strong>Symptoms / Notes</strong><br />${record.patient.symptoms || "No notes entered."}</div>`
          : ""
      }
      <h2>ECG Analysis</h2>
      <div class="grid">
        ${reportAnalysisRows(record)
          .map((item) => `<div class="box"><div class="label">${item.label}</div><div class="value">${item.value}</div></div>`)
          .join("")}
      </div>
      ${
        includeLatents
          ? `<h2>${format === "technical" ? "Latent Feature Representation" : "Explainability Features"}</h2><table><thead><tr><th>Feature</th><th>Value</th></tr></thead><tbody>${latentRows}</tbody></table>`
          : ""
      }
    </section>
  </main>
</body>
</html>`;
}

export default App;
