const form = document.querySelector("#lead-form");
const message = document.querySelector("#form-message");
const tableBody = document.querySelector("#leads-table-body");
const submitButton = document.querySelector("#submit-button");
const cancelEditButton = document.querySelector("#cancel-edit-button");
const searchInput = document.querySelector("#lead-search");
const statusFilter = document.querySelector("#status-filter");
const visibleLeadsCount = document.querySelector("#visible-leads-count");
const exportLeadsButton = document.querySelector("#export-leads-button");
const isFilePage = window.location.protocol === "file:";
const filePageMessage =
  "Abre la app desde el servidor local para poder guardar leads.";
let leadsCache = [];
let editingLeadId = null;

async function loadLeads() {
  if (isFilePage) {
    setMessage(filePageMessage, true);
    tableBody.innerHTML = `
      <tr>
        <td colspan="5">La tabla se cargara al abrir la app desde el servidor local.</td>
      </tr>
    `;
    updateVisibleLeadsCount(0);
    return;
  }

  try {
    const response = await fetch("/leads");

    if (!response.ok) {
      throw new Error("No se pudieron cargar los leads.");
    }

    const leads = await response.json();
    leadsCache = leads;
    applyLeadFilters();
  } catch (error) {
    tableBody.innerHTML = `
      <tr>
        <td colspan="5">No se pudieron cargar los leads.</td>
      </tr>
    `;
    updateVisibleLeadsCount(0);
  }
}

function renderLeads(leads) {
  updateVisibleLeadsCount(leads.length);

  if (leads.length === 0) {
    const emptyMessage =
      leadsCache.length === 0
        ? "Todavía no hay leads."
        : "No hay leads que coincidan con los filtros.";

    tableBody.innerHTML = `
      <tr>
        <td colspan="5">${emptyMessage}</td>
      </tr>
    `;
    return;
  }

  tableBody.innerHTML = leads
    .map(
      (lead) => `
        <tr>
          <td>${escapeHtml(lead.name)}</td>
          <td>${escapeHtml(lead.email)}</td>
          <td>${escapeHtml(lead.source || "")}</td>
          <td>
            <span class="status-badge status-${getStatusKey(lead.status)}">
              ${escapeHtml(formatStatus(lead.status))}
            </span>
          </td>
          <td>
            <div class="row-actions">
              <button class="small-button secondary-button" type="button" data-action="edit" data-id="${lead.id}">
                Editar
              </button>
              <button class="small-button danger-button" type="button" data-action="delete" data-id="${lead.id}">
                Eliminar
              </button>
            </div>
          </td>
        </tr>
      `
    )
    .join("");
}

function applyLeadFilters() {
  const searchTerm = searchInput.value.trim().toLowerCase();
  const selectedStatus = statusFilter.value;
  const filteredLeads = leadsCache.filter((lead) => {
    const name = String(lead.name || "").toLowerCase();
    const email = String(lead.email || "").toLowerCase();
    const matchesSearch =
      !searchTerm || name.includes(searchTerm) || email.includes(searchTerm);
    const matchesStatus =
      !selectedStatus || getStatusKey(lead.status) === selectedStatus;

    return matchesSearch && matchesStatus;
  });

  renderLeads(filteredLeads);
}

function updateVisibleLeadsCount(count) {
  const label = count === 1 ? "lead visible" : "leads visibles";
  visibleLeadsCount.textContent = `${count} ${label}`;
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (isFilePage) {
    setMessage(filePageMessage, true);
    return;
  }

  const formData = new FormData(form);
  const lead = {
    name: formData.get("name").trim(),
    email: formData.get("email").trim(),
    source: formData.get("source").trim(),
    status: formData.get("status")
  };

  setMessage("");

  try {
    const url = editingLeadId ? `/leads/${editingLeadId}` : "/leads";
    const method = editingLeadId ? "PUT" : "POST";
    const response = await fetch(url, {
      method,
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(lead)
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || "No se pudo crear el lead.");
    }

    const successMessage = editingLeadId
      ? "Lead actualizado correctamente."
      : "Lead añadido correctamente.";

    resetFormMode();
    setMessage(successMessage);
    await loadLeads();
  } catch (error) {
    setMessage(error.message, true);
  }
});

tableBody.addEventListener("click", async (event) => {
  const button = event.target.closest("button[data-action]");

  if (!button || isFilePage) {
    return;
  }

  const leadId = Number(button.dataset.id);

  if (button.dataset.action === "edit") {
    startEdit(leadId);
    return;
  }

  if (button.dataset.action === "delete") {
    await deleteLead(leadId);
  }
});

cancelEditButton.addEventListener("click", () => {
  resetFormMode();
  setMessage("");
});

searchInput.addEventListener("input", applyLeadFilters);
statusFilter.addEventListener("change", applyLeadFilters);
exportLeadsButton.addEventListener("click", (event) => {
  if (!isFilePage) {
    return;
  }

  event.preventDefault();
  setMessage(filePageMessage, true);
});

function startEdit(leadId) {
  const lead = leadsCache.find((currentLead) => currentLead.id === leadId);

  if (!lead) {
    setMessage("No se encontro el lead seleccionado.", true);
    return;
  }

  editingLeadId = lead.id;
  form.elements.name.value = lead.name || "";
  form.elements.email.value = lead.email || "";
  form.elements.source.value = lead.source || "";
  form.elements.status.value = getStatusKey(lead.status);
  submitButton.textContent = "Guardar cambios";
  cancelEditButton.hidden = false;
  setMessage("Editando lead. Guarda los cambios o cancela.");
  form.elements.name.focus();
}

async function deleteLead(leadId) {
  setMessage("");

  try {
    const response = await fetch(`/leads/${leadId}`, {
      method: "DELETE"
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || "No se pudo eliminar el lead.");
    }

    if (editingLeadId === leadId) {
      resetFormMode();
    }

    setMessage("Lead eliminado correctamente.");
    await loadLeads();
  } catch (error) {
    setMessage(error.message, true);
  }
}

function resetFormMode() {
  editingLeadId = null;
  form.reset();
  submitButton.textContent = "Añadir lead";
  cancelEditButton.hidden = true;
}

function setMessage(text, isError = false) {
  message.textContent = text;
  message.classList.toggle("error", isError);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatStatus(status) {
  if (status === "new") {
    return "nuevo";
  }

  return status || "nuevo";
}

function getStatusKey(status) {
  if (status === "new") {
    return "nuevo";
  }

  if (["nuevo", "contactado", "perdido"].includes(status)) {
    return status;
  }

  return "nuevo";
}

loadLeads();
