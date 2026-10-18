import { useState, useEffect } from "react";
import { supabase } from "./supabase";
import Auth from "./Auth";
import "./App.css";


async function readGeneratedText(response, setText, getChunk) {
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(detail || "Generation failed.");
  }

  if (!response.body) {
    throw new Error("This browser does not support streamed responses.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let pending = "";
  let text = "";

  function appendLine(line) {
    if (!line.trim()) return;

    const event = JSON.parse(line);
    if (event.error) throw new Error(event.error);

    const chunk = getChunk(event);
    if (chunk) {
      text += chunk;
      setText(text);
    }
  }

  while (true) {
    const { done, value } = await reader.read();
    pending += decoder.decode(value, { stream: !done });

    const lines = pending.split("\n");
    pending = lines.pop() || "";
    lines.forEach(appendLine);

    if (done) break;
  }

  appendLine(pending);
  return text;
}

async function prepareImageForAnalysis(file) {
  let bitmap;

  try {
    bitmap = await createImageBitmap(file);
    const maxDimension = 1400;
    const scale = Math.min(
      1,
      maxDimension / Math.max(bitmap.width, bitmap.height)
    );

    if (scale === 1 && file.size <= 1 * 1024 * 1024) {
      return file;
    }

    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);

    const context = canvas.getContext("2d");
    if (!context) return file;

    context.fillStyle = "#fff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

    const blob = await new Promise((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.82)
    );

    if (!blob) return file;

    const filename = `${file.name.replace(/\.[^.]+$/, "")}.jpg`;
    return new File([blob], filename, {
      type: "image/jpeg",
      lastModified: file.lastModified,
    });
  } catch {
    return file;
  } finally {
    bitmap?.close();
  }
}

function App() {
  
  const [session, setSession] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);  
  const [students, setStudents] = useState([]);
  const [studentsLoading, setStudentsLoading] = useState(false);
  const [studentsError, setStudentsError] = useState("");
  const [studentSaving, setStudentSaving] = useState(false);
  const [studentName, setStudentName] = useState("");
  const [studentGrade, setStudentGrade] = useState("");
  const [studentSubjects, setStudentSubjects] = useState("");
  const [editingStudentId, setEditingStudentId] = useState(null);
  const [studentSearch, setStudentSearch] = useState("");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [gradeStudentId, setGradeStudentId] = useState("");
  const [gradeAssessments, setGradeAssessments] = useState(() =>
    Array.from({ length: 8 }, () => ({ name: "", grade: "", weight: "" }))
  );
  const [gradeSaving, setGradeSaving] = useState(false);
  const [gradeError, setGradeError] = useState("");
  const [savedGradeResult, setSavedGradeResult] = useState(null);
  
  useEffect(() => {
    setStudents([]);
    setStudentsError("");
    setEditingStudentId(null);
    setStudentName("");
    setStudentGrade("");
    setStudentSubjects("");
  }, 
  [session?.user?.id]);


  useEffect(() => {
    supabase.auth.getSession().then(({ data, error }) => {
      if (error) {
        console.error("Could not retrieve session:", error.message);
      }

      setSession(data?.session ?? null);
      setAuthLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      setAuthLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const [student, setStudent] = useState("");
  const [teacher, setTeacher] = useState("");
  const [grade, setGrade] = useState("Grade 1");
  const [subject, setSubject] = useState("Math");
  const [topic, setTopic] = useState("");
  const [strengths, setStrengths] = useState("");
  const [challenges, setChallenges] = useState("");
  const [nextSteps, setNextSteps] = useState("");
  const [report, setReport] = useState("");
  const [loading, setLoading] = useState(false);
  const [uploadedImages, setUploadedImages] = useState([]);
  const [analysisResult, setAnalysisResult] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisStatus, setAnalysisStatus] = useState("");
  const [outputType, setOutputType] = useState("both");
  const [activeSection, setActiveSection] = useState("dashboard");
  const [savedReports, setSavedReports] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const [selectedSavedReport, setSelectedSavedReport] = useState(null);
  const [historySearch, setHistorySearch] = useState("");

  useEffect(() => {
    if (!selectedSavedReport) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function closeOnEscape(event) {
      if (event.key === "Escape") {
        setSelectedSavedReport(null);
      }
    }

    window.addEventListener("keydown", closeOnEscape);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [selectedSavedReport]);

  
async function loadReportHistory() {
  setHistoryLoading(true);
  setHistoryError("");

  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token;

    if (!accessToken) {
      throw new Error("Please log in again.");
    }

    const response = await fetch(
      "http://127.0.0.1:8000/my-reports",
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    if (!response.ok) {
      throw new Error("Could not load your saved reports.");
    }

    const data = await response.json();
    setSavedReports(data.reports || []);
  } catch (error) {
    setHistoryError(error.message || "Something went wrong.");
  } finally {
    setHistoryLoading(false);
  }
}

async function deleteSavedReport(reportId) {
  if (!window.confirm("Delete this saved report? This cannot be undone.")) {
    return;
  }

  setHistoryError("");

  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token;

    if (!accessToken) {
      throw new Error("Please log in again.");
    }

    const response = await fetch(
      `http://127.0.0.1:8000/my-reports/${encodeURIComponent(reportId)}`,
      {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    if (!response.ok) {
      throw new Error("Could not delete this report.");
    }

    setSavedReports((reports) =>
      reports.filter((item) => item.id !== reportId)
    );
    setSelectedSavedReport((selected) =>
      selected?.id === reportId ? null : selected
    );
  } catch (error) {
    setHistoryError(error.message || "Something went wrong.");
  }
}

const filteredSavedReports = savedReports.filter((item) => {
  const query = historySearch.trim().toLowerCase();
  if (!query) return true;

  return [
    item.student,
    item.grade,
    item.subject,
    item.topic,
    item.report,
  ]
    .filter(Boolean)
    .some((value) => value.toLowerCase().includes(query));
});

  async function generateReport() {
  if (!student.trim()) {
    alert("Please enter the student's name.");
    return;
  }

  if (!topic.trim() || (!strengths.trim() && !challenges.trim())) {
    alert("Please enter the topic and at least one observation.");
    return;
  }

  setLoading(true);
  setReport("");

  
try {
  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData.session?.access_token;

  if (!accessToken) {
    throw new Error("Please log in again.");
  }

  const response = await fetch("http://127.0.0.1:8000/generate-report", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      student,
      teacher,
      grade,
      subject,
      topic,
      strengths,
      challenges,
      next_steps: nextSteps,
    }),
  });

    await readGeneratedText(response, setReport, (event) => event.response || "");
  } catch (error) {
    console.error(error);
    alert(
      "Could not generate the report. Check that Ollama and your backend are running."
    );
  } finally {
    setLoading(false);
  }
}

function handleImageUpload(event) {
  const files = Array.from(event.target.files || []);
  const imageFiles = files.filter((file) =>
    file.type.startsWith("image/")
  );

  const newImages = imageFiles.map((file) => ({
    id: `${file.name}-${file.lastModified}-${Math.random()}`,
    file,
    preview: URL.createObjectURL(file),
  }));

  setUploadedImages((current) => [...current, ...newImages]);

  event.target.value = "";
}

function removeImage(id) {
  setUploadedImages((current) => {
    const imageToRemove = current.find((image) => image.id === id);

    if (imageToRemove) {
      URL.revokeObjectURL(imageToRemove.preview);
    }

    return current.filter((image) => image.id !== id);
  });
}
async function analyzeWork() {
  if (uploadedImages.length === 0) {
    alert("Please upload at least one picture first.");
    return;
  }

  setAnalyzing(true);
  setAnalysisStatus("Preparing images...");
  setAnalysisResult("");

  try {
    const formData = new FormData();
    const preparedImages = await Promise.all(
      uploadedImages.map(({ file }) => prepareImageForAnalysis(file))
    );

    preparedImages.forEach((file) => {
      formData.append("images", file, file.name);
    });

    formData.append("grade", grade);
    formData.append("subject", subject);
    formData.append("topic", topic || "Not specified");

    setAnalysisStatus("Analyzing student work...");
    
   const { data: sessionData } = await supabase.auth.getSession();
const accessToken = sessionData.session?.access_token;

if (!accessToken) {
  throw new Error("Please log in again.");
}

const response = await fetch(
  "http://127.0.0.1:8000/analyze-work",
  {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${accessToken}`,
    },
    body: formData,
  }
);

    await readGeneratedText(
      response,
      setAnalysisResult,
      (event) => event.message?.content || ""
    );

  } catch (error) {
    console.error("Analysis error:", error);
    alert(
      "Could not analyze the pictures. Check the backend, Ollama, and vision model."
    );
  } finally {
    setAnalyzing(false);
    setAnalysisStatus("");
  }
}

  
  if (authLoading) {
    return <p>Loading TutorPrep AI...</p>;
  }

  if (!session) {
    return <Auth onLogin={setSession} />;
  }
  
async function loadStudents() {
  setStudentsLoading(true);
  setStudentsError("");
  setStudents([]);

  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;

    if (!token) {
      throw new Error("Please log in again.");
    }

    const response = await fetch("http://127.0.0.1:8000/students", {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      throw new Error("Could not load students.");
    }

    const data = await response.json();
    setStudents(data.students || []);
  } catch (error) {
    setStudents([]);
    setStudentsError(error.message || "Something went wrong.");
  } finally {
    setStudentsLoading(false);
  }
}

function resetStudentForm() {
  setStudentName("");
  setStudentGrade("");
  setStudentSubjects("");
  setEditingStudentId(null);
}

async function saveStudent(event) {
  event.preventDefault();
  setStudentSaving(true);
  setStudentsError("");

  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;

    if (!token) {
      throw new Error("Please log in again.");
    }

    const payload = {
      name: studentName.trim(),
      grade: studentGrade.trim(),
      subjects: studentSubjects
        .split(",")
        .map((subject) => subject.trim())
        .filter(Boolean),
    };

    const isEditing = Boolean(editingStudentId);

    const url = isEditing
      ? `http://127.0.0.1:8000/students/${editingStudentId}`
      : "http://127.0.0.1:8000/students";

    const response = await fetch(url, {
      method: isEditing ? "PUT" : "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.detail || "Could not save student.");
    }

    resetStudentForm();
    await loadStudents();
  } catch (error) {
    setStudentsError(error.message || "Something went wrong.");
  } finally {
    setStudentSaving(false);
  }
}

function updateGradeAssessment(index, field, value) {
  setGradeAssessments((current) =>
    current.map((assessment, currentIndex) =>
      currentIndex === index
        ? { ...assessment, [field]: value }
        : assessment
    )
  );
  setGradeError("");
}

async function saveStudentGrades(event) {
  event.preventDefault();
  setGradeError("");
  setSavedGradeResult(null);

  if (!gradeStudentId) {
    setGradeError("Select a student first.");
    return;
  }

  const enteredAssessments = gradeAssessments.filter(
    ({ name, grade, weight }) => name.trim() || grade !== "" || weight !== ""
  );

  if (enteredAssessments.length === 0) {
    setGradeError("Enter at least one assessment.");
    return;
  }

  const hasInvalidAssessment = enteredAssessments.some(
    ({ name, grade: markValue, weight: weightValue }) => {
      const mark = Number(markValue);
      const weight = Number(weightValue);

      return (
        !name.trim() ||
        markValue === "" ||
        weightValue === "" ||
        !Number.isFinite(mark) ||
        mark < 0 ||
        mark > 100 ||
        !Number.isFinite(weight) ||
        weight <= 0 ||
        weight > 100
      );
    }
  );

  if (hasInvalidAssessment) {
    setGradeError(
      "Complete each entered row with a name, a grade from 0 to 100, and a weight above 0 up to 100."
    );
    return;
  }

  const assessments = enteredAssessments.map((assessment) => ({
    name: assessment.name.trim(),
    grade: Number(assessment.grade),
    weight: Number(assessment.weight),
  }));

  setGradeSaving(true);

  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;

    if (!token) {
      throw new Error("Please log in again.");
    }

    const response = await fetch(
      `http://127.0.0.1:8000/students/${gradeStudentId}/grades`,
      {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ assessments }),
      }
    );

    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(
        typeof result.detail === "string"
          ? result.detail
          : "Could not save grades."
      );
    }

    setSavedGradeResult(result.student);
    setStudents((current) =>
      current.map((item) =>
        item.id === result.student.id ? result.student : item
      )
    );
  } catch (error) {
    setGradeError(error.message || "Could not save grades.");
  } finally {
    setGradeSaving(false);
  }
}

function startEditingStudent(student) {
  setEditingStudentId(student.id);
  setStudentName(student.name);
  setStudentGrade(student.grade);
  setStudentSubjects(student.subjects.join(", "));
  setStudentsError("");
}

async function deleteStudent(student) {
  const confirmed = window.confirm(
    `Delete ${student.name}'s profile? This cannot be undone.`
  );

  if (!confirmed) return;

  setStudentsError("");

  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;

    if (!token) {
      throw new Error("Please log in again.");
    }

    const response = await fetch(
      `http://127.0.0.1:8000/students/${student.id}`,
      {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    if (!response.ok) {
      throw new Error("Could not delete student.");
    }

    if (editingStudentId === student.id) {
      resetStudentForm();
    }

    await loadStudents();
  } catch (error) {
    setStudentsError(error.message || "Something went wrong.");
  }
}

  return (
    <div className="app dashboard-layout">
  
<aside className={`sidebar ${sidebarCollapsed ? "collapsed" : ""}`}>
  <div className="sidebar-header">
    {!sidebarCollapsed && (
      <div className="sidebar-logo">
        <span>Tutor <strong>Assist</strong></span>
      </div>
    )}

    <button
      type="button"
      className="sidebar-toggle"
      onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
      aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
      title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
    >
      ☰
    </button>
  </div>

  {!sidebarCollapsed && <p className="sidebar-label">WORKSPACE</p>}

  <nav className="sidebar-nav">
    <button
      type="button"
      title="Home"
      className={`nav-item ${activeSection === "dashboard" ? "active" : ""}`}
      onClick={() => setActiveSection("dashboard")}
    >
      <span className="nav-icon">⌂</span>
      <span className="nav-text">Home</span>
    </button>

    <button
      type="button"
      title="Generate Report"
      className={`nav-item ${activeSection === "reports" ? "active" : ""}`}
      onClick={() => setActiveSection("reports")}
    >
      <span className="nav-icon">✎</span>
      <span className="nav-text">Generate Report</span>
    </button>

    <button
      type="button"
      title="Analyze Work"
      className={`nav-item ${activeSection === "analyze" ? "active" : ""}`}
      onClick={() => setActiveSection("analyze")}
    >
      <span className="nav-icon">▧</span>
      <span className="nav-text">Analyze Work</span>
    </button>

    <button
      type="button"
      title="Report History"
      className={`nav-item ${activeSection === "history" ? "active" : ""}`}
      onClick={() => {
        setActiveSection("history");
        setSelectedSavedReport(null);
        loadReportHistory();
      }}
    >
      <span className="nav-icon">◷</span>
      <span className="nav-text">Report History</span>
    </button>

    <button
      type="button"
      title="Students"
      className={`nav-item ${activeSection === "students" ? "active" : ""}`}
      onClick={() => {
        setActiveSection("students");
        loadStudents();
      }}
    >
      <span className="nav-icon">♙</span>
      <span className="nav-text">Students</span>
    </button>

    <button
      type="button"
      title="Grade Generator"
      className={`nav-item ${activeSection === "grade-generator" ? "active" : ""}`}
      onClick={() => {
        setActiveSection("grade-generator");
        loadStudents();
      }}
    >
      <span className="nav-icon">▤</span>
      <span className="nav-text">Grade Generator</span>
    </button>
  </nav>

  <div className="sidebar-footer">
    <div className="profile-icon">♙</div>

    {!sidebarCollapsed && (
      <div className="profile-details">
        <strong>Tutor Account</strong>
        <span>Workspace</span>
      </div>
    )}

    <button
      type="button"
      className="logout-button"
      title="Log out"
      aria-label="Log out"
      onClick={async () => {
        const { error } = await supabase.auth.signOut();

        if (error) {
          alert("Could not log out: " + error.message);
        }
      }}
    >
      ↪
    </button>
  </div>
</aside>

  <div className="dashboard-main">
      {activeSection === "dashboard" && (
  <section className="dashboard-home welcome-section">
    {sidebarCollapsed && (
      <button
        type="button"
        className="dashboard-sidebar-toggle"
        onClick={() => setSidebarCollapsed(false)}
      >
        <span aria-hidden="true">☰</span> Get Started
      </button>
    )}

    <div className="intro">
      <p className="eyebrow">YOUR TUTORING WORKSPACE</p>
      <h1>Welcome to Tutor Assist!</h1>
      
    </div>

  </section>
)}

{activeSection === "reports" && (
      <main className="container">
        
        <section className="form-card">
          <div className="card-heading">
            <div>
              <p className="eyebrow">SESSION WORKSPACE</p>
              <h2>Student progress notes</h2>
            </div>
          </div>

          <div className="form-grid">
            <label>
              Student name
              <input
                value={student}
                onChange={(e) => setStudent(e.target.value)}
                placeholder="e.g. Alex"
              />
            </label>

            <label>
              Teacher's Name
              <input
                value={teacher}
                onChange={(e) => setTeacher(e.target.value)}
                placeholder="e.g. Ms. Johnson"
              />
            </label>

            <label>
              Grade level
              <select value={grade} onChange={(e) => setGrade(e.target.value)}>
                <option>Kindergarten</option>
                <option>Grade 1</option>
                <option>Grade 2</option>
                <option>Grade 3</option>
                <option>Grade 4</option>
                <option>Grade 5</option>
                <option>Grade 6</option>
                <option>Grade 7</option>
                <option>Grade 8</option>
                <option>Grade 9</option>
                <option>Grade 10</option>
                <option>Grade 11</option>
                <option>Grade 12</option>
              </select>
            </label>

            <label>
              Subject
              <select
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
              >
                <option>Math</option>
                <option>English</option>
                <option>Science</option>
                <option>French</option>
                <option>Other</option>
              </select>
            </label>

            <label>
              Topic covered
              <input
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="e.g. Equivalent fractions"
              />
            </label>

            <label className="full-width">
              What did the student do well?
              <textarea
                value={strengths}
                onChange={(e) => setStrengths(e.target.value)}
                placeholder="Describe what you observed during the session..."
                rows={3}
              />
            </label>

            <label className="full-width">
              What needs more practice?
              <textarea
                value={challenges}
                onChange={(e) => setChallenges(e.target.value)}
                placeholder="What was difficult? Include specific examples..."
                rows={3}
              />
            </label>

            <label className="full-width">
              Recommended next steps
              <textarea
                value={nextSteps}
                onChange={(e) => setNextSteps(e.target.value)}
                placeholder="What should you review or practice for next time?"
                rows={2}
              />
            </label>
          </div>
        

        <button
          className="generate-button"
          onClick={generateReport}
          disabled={loading}
        >
          {loading ? "Generating report..." : "Prepare progress report"}
          {!loading && <span>→</span>}
        </button>

        {report && (
          <section className="report-result">
            <p className="eyebrow">YOUR GENERATED REPORT</p>
            <h2>Student progress update</h2>
            <div className="report-text">{report}</div>
            <button
              className="copy-button"
              onClick={() => navigator.clipboard.writeText(report)}
          >
            Copy report
          </button>
        </section>
      )}

          </section>
      </main>
    )}

{activeSection === "analyze" && (
  <main className="container">
    <section className="form-card">
      <div className="card-heading">
        <div>
          <p className="eyebrow">STUDENT WORKSPACE</p>
          <h2>Analyze student work by uploading</h2>
        </div>
      </div>
      <section className="upload-section">
  <div className="card-heading">
    <p>
      Add recent tests, quizzes, or worksheets to personalize learning recommendations.
    </p>
  </div>

  <label className="upload-zone" htmlFor="student-work-images">
    <span className="upload-icon">＋</span>
    <strong>Choose pictures to upload </strong>
    <span>Click here to browse files on your computer </span>
    <span className="upload-formats">JPG, PNG, WEBP</span>
  </label>

  <input
    id="student-work-images"
    className="image-file-input"
    type="file"
    accept="image/*"
    multiple
    onChange={handleImageUpload}
  />

  {uploadedImages.length > 0 && (
    <div className="image-preview-grid">
      {uploadedImages.map((image) => (
        <div className="image-preview-card" key={image.id}>
          <img src={image.preview} alt={image.file.name} />

          <div className="image-preview-info">
            <span title={image.file.name}>
              {image.file.name}
            </span>

            <button
              type="button"
              className="remove-image-button"
              onClick={() => removeImage(image.id)}
              aria-label={`Remove ${image.file.name}`}
            >
              Remove
            </button>
          </div>
        </div>
      ))}
    </div>
  )}

  
</section>
<button
  type="button"
  className="generate-button"
  onClick={analyzeWork}
  disabled={analyzing || uploadedImages.length === 0}
>
  {analyzing ? analysisStatus : "Analyze uploaded work"}
  {!analyzing && <span>→</span>}
</button>

{analysisResult && (
  <section className="report-result">
    <p className="eyebrow">AI ANALYSIS</p>
    <h2>Student work feedback</h2>

    <div
      className="report-text"
      style={{ whiteSpace: "pre-wrap" }}
    >
      {analysisResult}
    </div>

    <button
      type="button"
      className="copy-button"
      onClick={() =>
        navigator.clipboard.writeText(analysisResult)
      }
    >
      Copy analysis
    </button>
  </section>
)}

    </section>
  </main>
)}
{activeSection === "history" && (
  <main className="container">
    <section className="form-card">
      <p className="eyebrow">YOUR SAVED REPORTS</p>
      <h2>Report History</h2>
      <p>View reports you have previously generated.</p>

      <input
        className="history-search"
        type="search"
        value={historySearch}
        onChange={(event) => setHistorySearch(event.target.value)}
        placeholder="Search by student, subject, topic, or report text"
        aria-label="Search saved reports"
      />

      {historyLoading && <p>Loading saved reports...</p>}

      {historyError && (
        <p role="alert">{historyError}</p>
      )}

      {!historyLoading &&
        !historyError &&
        savedReports.length === 0 && (
          <p>
            No saved reports yet. Generate a report to see it here.
          </p>
        )}

      {!historyLoading &&
        !historyError &&
        savedReports.length > 0 &&
        filteredSavedReports.length === 0 && (
          <p className="history-empty">No reports match your search.</p>
        )}

      <div className="history-list">
        {filteredSavedReports.map((item) => (
          <div className="history-entry" key={item.id}>
            <button
              type="button"
              className="history-item"
              onClick={() => setSelectedSavedReport(item)}
            >
              <strong>{item.student || "Unnamed student"}</strong>

              <span>
                {[item.grade, item.subject, item.topic]
                  .filter(Boolean)
                  .join(" · ")}
              </span>

              <small>
                {item.created_at
                  ? new Date(item.created_at).toLocaleString()
                  : ""}
              </small>
            </button>
            <button
              type="button"
              className="delete-report-button"
              aria-label={`Delete report for ${item.student || "student"}`}
              onClick={() => deleteSavedReport(item.id)}
            >
              Delete
            </button>
          </div>
        ))}
      </div>

      {selectedSavedReport && (
        <div
          className="report-modal-backdrop"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              setSelectedSavedReport(null);
            }
          }}
        >
          <section
            className="report-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="saved-report-title"
          >
            <header className="report-modal-header">
              <div>
                <p className="eyebrow">SAVED PROGRESS REPORT</p>
                <h2 id="saved-report-title">
                  Report for {selectedSavedReport.student || "Student"}
                </h2>
              </div>
              <button
                type="button"
                className="report-modal-close"
                aria-label="Close report"
                onClick={() => setSelectedSavedReport(null)}
              >
                ×
              </button>
            </header>

            <div className="report-modal-content">
              {selectedSavedReport.report}
            </div>

            <footer className="report-modal-footer">
              <button
                type="button"
                className="copy-button"
                onClick={() =>
                  navigator.clipboard.writeText(
                    selectedSavedReport.report || ""
                  )
                }
              >
                Copy Report
              </button>
            </footer>
          </section>
        </div>
      )}
    </section>
  </main>
)}

{activeSection === "grade-generator" && (
  <main className="container">
    <section className="form-card grade-generator-card">
      <p className="eyebrow">ASSESSMENT WEIGHTS</p>
      <h2>Grade Generator</h2>

      <form className="grade-form" onSubmit={saveStudentGrades}>
        <label className="grade-student-select" htmlFor="grade-student">
          Student
          <select
            id="grade-student"
            value={gradeStudentId}
            onChange={(event) => {
              setGradeStudentId(event.target.value);
              setSavedGradeResult(null);
              setGradeError("");
            }}
            required
          >
            <option value="">Select a student</option>
            {students.map((item) => (
              <option value={item.id} key={item.id}>
                {item.name} ({item.code})
              </option>
            ))}
          </select>
        </label>

        {studentsLoading && <p>Loading students...</p>}
        {studentsError && (
          <p role="alert" className="student-error">
            {studentsError}
          </p>
        )}
        {!studentsLoading && students.length === 0 && (
          <p>Add a student in the Students section before entering grades.</p>
        )}

        <div className="grade-assessment-list">
          <div className="grade-assessment-row grade-assessment-header">
            <span>Slot</span>
            <span>Assessment</span>
            <span>Grade (%)</span>
            <span>Weight (%)</span>
          </div>

          {gradeAssessments.map((assessment, index) => (
            <div className="grade-assessment-row" key={index}>
              <span className="grade-slot-label">
                Assessment {index + 1}
              </span>
              <input
                aria-label={`Assessment ${index + 1} name`}
                value={assessment.name}
                onChange={(event) =>
                  updateGradeAssessment(index, "name", event.target.value)
                }
                placeholder="e.g. Fractions test"
                maxLength={100}
              />
              <input
                aria-label={`Assessment ${index + 1} grade percentage`}
                type="number"
                min="0"
                max="100"
                step="0.01"
                value={assessment.grade}
                onChange={(event) =>
                  updateGradeAssessment(index, "grade", event.target.value)
                }
                placeholder="0-100"
              />
              <input
                aria-label={`Assessment ${index + 1} weight percentage`}
                type="number"
                min="0.01"
                max="100"
                step="0.01"
                value={assessment.weight}
                onChange={(event) =>
                  updateGradeAssessment(index, "weight", event.target.value)
                }
                placeholder="Weight"
              />
            </div>
          ))}
        </div>

        {gradeError && (
          <p role="alert" className="student-error">
            {gradeError}
          </p>
        )}

        <button
          type="submit"
          className="generate-button"
          disabled={gradeSaving || studentsLoading || students.length === 0}
        >
          {gradeSaving ? "Saving final mark..." : "Calculate and save final mark"}
        </button>
      </form>

      {savedGradeResult && (
        <section className="grade-result" aria-live="polite">
          <p>Final mark for {savedGradeResult.name}</p>
          <strong>{Number(savedGradeResult.final_mark).toFixed(2)}%</strong>
        </section>
      )}
    </section>
  </main>
)}


{activeSection === "students" && (
  <main className="container">
    <section className="form-card">
      <p className="eyebrow">STUDENT MANAGEMENT</p>
      <h2>Students</h2>
      <p>Manage your students, grades, and learning subjects.</p>

      <form onSubmit={saveStudent} className="student-form">
        <h3>
          {editingStudentId ? "Edit Student" : "Add a Student"}
        </h3>

        <label htmlFor="student-name">Student Name</label>
        <input
          id="student-name"
          value={studentName}
          onChange={(event) => setStudentName(event.target.value)}
          placeholder="Enter student name"
          maxLength={100}
          required
        />

        <label htmlFor="student-grade">Grade</label>
        <input
          id="student-grade"
          value={studentGrade}
          onChange={(event) => setStudentGrade(event.target.value)}
          placeholder="e.g. Grade 5"
          maxLength={30}
          required
        />

        <label htmlFor="student-subjects">Subjects</label>
        <input
          id="student-subjects"
          value={studentSubjects}
          onChange={(event) => setStudentSubjects(event.target.value)}
          placeholder="e.g. Math, English, Science"
          required
        />
        <small>Separate subjects with commas.</small>

        {studentsError && (
          <p role="alert" className="student-error">
            {studentsError}
          </p>
        )}

        <div className="student-form-actions">
          <button
            type="submit"
            className="generate-button"
            disabled={studentSaving}
          >
            {studentSaving
              ? "Saving..."
              : editingStudentId
                ? "Save Changes"
                : "Add Student"}
          </button>

          {editingStudentId && (
            <button
              type="button"
              className="student-secondary-button"
              onClick={resetStudentForm}
            >
              Cancel
            </button>
          )}
        </div>
      </form>
    </section>

    <section className="form-card student-directory">
      <h3>Your Students</h3>

      <input
        className="student-search"
        value={studentSearch}
        onChange={(event) => setStudentSearch(event.target.value)}
        placeholder="Search by name or student code..."
      />

      <button
        type="button"
        className="student-secondary-button"
        onClick={loadStudents}
        disabled={studentsLoading}
      >
        {studentsLoading ? "Loading..." : "Refresh Students"}
      </button>

      {studentsError && (
        <p role="alert" className="student-error">
          {studentsError}
        </p>
      )}

      {!studentsLoading && students.length === 0 && (
        <p>No students yet. Add your first student above!</p>
      )}

      <div className="student-list">
        {students
          .filter((student) => {
            const search = studentSearch.toLowerCase();

            return (
              student.name.toLowerCase().includes(search) ||
              student.code.toLowerCase().includes(search)
            );
          })
          .map((student) => (
            <article className="student-card" key={student.id}>
              <div className="student-card-heading">
                <div>
                  <strong>{student.name}</strong>
                  <p>
                    <strong>Grade: </strong>
                    {student.grade}
                  </p>
                </div>
                  <p>
                      <strong>Student ID: </strong>
                      {student.code}
                  </p>
              </div>

              <p>
                <strong>Subjects:</strong>{" "}
                {student.subjects.join(", ")}
              </p>

              {student.final_mark !== null &&
                student.final_mark !== undefined && (
                  <p className="student-final-mark">
                    <strong>Final mark:</strong>{" "}
                    {Number(student.final_mark).toFixed(2)}%
                  </p>
                )}

              <div className="student-card-actions">
                <button
                  type="button"
                  className="student-secondary-button"
                  onClick={() => startEditingStudent(student)}
                >
                  Edit
                </button>

                <button
                  type="button"
                  className="student-delete-button"
                  onClick={() => deleteStudent(student)}
                >
                  Delete
                </button>
              </div>
            </article>
          ))}
      </div>
    </section>
  </main>
)}

      <footer>
        Tutor Assist · Built for tutors, focused on student growth.
      </footer>
    </div>
  </div>
  );
}

export default App;
