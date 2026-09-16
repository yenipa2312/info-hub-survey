const form = document.getElementById("survey-form");
const submitBtn = document.getElementById("submit-btn");
const statusEl = document.getElementById("status");

const roleHint = document.getElementById("role-hint");
const roleBranch = document.getElementById("role-branch");
const roleCC = document.getElementById("role-cc");

const sourceOutlook = document.getElementById("source-outlook");
const outlookBlock = document.getElementById("outlook-block");

const sourceOtherCheck = document.getElementById("source-other-check");
const sourceOtherText = document.getElementById("source-other-text");

const outlookOtherCheck = document.getElementById("outlook-other-check");
const outlookOtherText = document.getElementById("outlook-other-text");

const MIN_STARTING_SOURCE_CHARS = 15;

// Q1 -> Q2: show only the role list for the chosen location, disable the
// other one so it can't submit a stray value and isn't part of validation.
form.querySelectorAll('input[name="location"]').forEach((input) => {
  input.addEventListener("change", () => {
    const isBranch = input.value === "Մասնաճյուղում";
    roleBranch.hidden = !isBranch;
    roleCC.hidden = isBranch;
    setGroupDisabled(roleBranch, !isBranch);
    setGroupDisabled(roleCC, isBranch);
    roleHint.hidden = true;
    form.querySelectorAll('input[name="role"]').forEach((r) => (r.checked = false));
  });
});

sourceOutlook.addEventListener("change", () => {
  outlookBlock.hidden = !sourceOutlook.checked;
  setGroupDisabled(outlookBlock, !sourceOutlook.checked);
});

sourceOtherCheck.addEventListener("change", () => {
  sourceOtherText.hidden = !sourceOtherCheck.checked;
  if (!sourceOtherCheck.checked) sourceOtherText.value = "";
});

outlookOtherCheck.addEventListener("change", () => {
  outlookOtherText.hidden = !outlookOtherCheck.checked;
  if (!outlookOtherCheck.checked) outlookOtherText.value = "";
});

function setGroupDisabled(container, disabled) {
  container.querySelectorAll("input").forEach((el) => (el.disabled = disabled));
}

function checkedValues(name) {
  return [...form.querySelectorAll(`input[name="${name}"]:checked`)].map((el) => el.value);
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();

  const location = form.location.value;
  const role = form.querySelector('input[name="role"]:checked')?.value || null;
  const name = form.name.value.trim();
  const infoSources = checkedValues("infoSources");
  const infoSourceOtherText = sourceOtherCheck.checked ? sourceOtherText.value.trim() : null;
  const outlookTypes = sourceOutlook.checked ? checkedValues("outlookTypes") : null;
  const outlookOtherTextValue = sourceOutlook.checked && outlookOtherCheck.checked ? outlookOtherText.value.trim() : null;
  const timeToFind = form.timeToFind.value;
  const preferredSolutions = checkedValues("preferredSolutions");
  const chatbotLikelihoodChecked = form.querySelector('input[name="chatbotLikelihood"]:checked');
  const chatbotLikelihood = chatbotLikelihoodChecked ? Number(chatbotLikelihoodChecked.value) : null;
  const chatbotAnswerPrefs = checkedValues("chatbotAnswerPrefs");
  const startingSource = form.startingSource.value.trim();
  const otherNotes = form.otherNotes.value.trim();

  if (!role) {
    setStatus("Խնդրում ենք ընտրել Ձեր պաշտոնը։", "error");
    return;
  }
  if (!infoSources.length) {
    setStatus("Խնդրում ենք ընտրել առնվազն մեկ տարբերակ 4-րդ հարցում։", "error");
    return;
  }
  if (sourceOtherCheck.checked && !infoSourceOtherText) {
    setStatus("Խնդրում ենք նշել՝ ինչ նկատի ունեք «Այլ»-ի տակ 4-րդ հարցում։", "error");
    return;
  }
  if (sourceOutlook.checked && (!outlookTypes || !outlookTypes.length)) {
    setStatus("Խնդրում ենք նշել՝ ինչ տեսակի տեղեկատվություն եք փնտրում Outlook նամակագրությունում։", "error");
    return;
  }
  if (sourceOutlook.checked && outlookOtherCheck.checked && !outlookOtherTextValue) {
    setStatus("Խնդրում ենք նշել՝ ինչ նկատի ունեք «Այլ»-ի տակ Outlook-ի հարցում։", "error");
    return;
  }
  if (!preferredSolutions.length) {
    setStatus("Խնդրում ենք ընտրել առնվազն մեկ տարբերակ 6-րդ հարցում։", "error");
    return;
  }
  if (!chatbotAnswerPrefs.length) {
    setStatus("Խնդրում ենք ընտրել առնվազն մեկ տարբերակ 8-րդ հարցում։", "error");
    return;
  }
  if (!startingSource) {
    setStatus("Խնդրում ենք պատասխանել 9-րդ հարցին։", "error");
    return;
  }
  if (startingSource.length < MIN_STARTING_SOURCE_CHARS) {
    setStatus(`9-րդ հարցի պատասխանը պետք է լինի առնվազն ${MIN_STARTING_SOURCE_CHARS} նիշ։`, "error");
    return;
  }

  submitBtn.disabled = true;
  setStatus("Ուղարկվում է...");

  try {
    const res = await fetch("/.netlify/functions/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        location,
        role,
        name,
        infoSources,
        infoSourceOtherText,
        outlookTypes,
        outlookOtherText: outlookOtherTextValue,
        timeToFind,
        preferredSolutions,
        chatbotLikelihood,
        chatbotAnswerPrefs,
        startingSource,
        otherNotes,
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || `Request failed with status ${res.status}`);
    }

    window.location.href = "thanks.html";
  } catch (err) {
    setStatus(err.message, "error");
  } finally {
    submitBtn.disabled = false;
  }
});

function setStatus(message, kind) {
  statusEl.textContent = message;
  statusEl.classList.toggle("error", kind === "error");
  statusEl.classList.toggle("success", kind === "success");
}
