const ALLOWED_FIELDS = ['firstName', 'lastName', 'role', 'company', 'organization', 'color', 'photo', 'reportsTo', 'dottedReportsTo'];
const REQUIRED_FIELDS = ['firstName', 'lastName'];

function sanitizeFilename(name) {
  return name.replace(/[^a-zA-Z0-9_\-. ]/g, '_').trim() || 'orgchart';
}

/** Export the active org chart as a JSON file download. */
export function exportOrgChart(activeId) {
  const indexRaw = localStorage.getItem('orgcharts_index');
  const charts = indexRaw ? JSON.parse(indexRaw) : [];
  const chart = charts.find(c => c.id === activeId);
  const name = chart?.name ?? 'Org Chart';

  const peopleRaw = localStorage.getItem(`orgchart_people_${activeId}`);
  const people = peopleRaw ? JSON.parse(peopleRaw) : [];

  const groupsRaw = localStorage.getItem(`orgchart_groups_${activeId}`);
  const groups = groupsRaw ? JSON.parse(groupsRaw) : [];

  const viewportRaw = localStorage.getItem(`orgchart-viewport-${activeId}`);
  const viewport = viewportRaw ? JSON.parse(viewportRaw) : null;

  const data = {
    version: 1,
    orgChart: { name, people, groups, viewport },
  };

  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${sanitizeFilename(name)}.orgchart.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** Parse and validate an .orgchart.json File. Returns { name, people, viewport } or throws. */
export async function parseOrgChartFile(file) {
  const text = await file.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('Invalid JSON file.');
  }

  if (!data || typeof data !== 'object' || !data.orgChart) {
    throw new Error('Not a valid org chart file.');
  }

  const { orgChart } = data;

  if (!orgChart.name || typeof orgChart.name !== 'string') {
    throw new Error('Org chart file is missing a name.');
  }

  if (!Array.isArray(orgChart.people)) {
    throw new Error('Org chart file is missing people array.');
  }

  // Validate each person
  const validPeople = [];
  for (const raw of orgChart.people) {
    if (!raw || typeof raw !== 'object') continue;

    // Check required fields
    const missing = REQUIRED_FIELDS.filter(f => !raw[f] || typeof raw[f] !== 'string');
    if (missing.length > 0) continue; // Skip invalid people

    const person = { id: raw.id || crypto.randomUUID() };
    for (const field of ALLOWED_FIELDS) {
      if (raw[field] !== undefined && raw[field] !== null) {
        person[field] = raw[field];
      }
    }
    person.firstName = raw.firstName;
    person.lastName = raw.lastName;
    validPeople.push(person);
  }

  // Detect circular reportsTo references
  const idSet = new Set(validPeople.map(p => p.id));
  for (const p of validPeople) {
    if (p.reportsTo && !idSet.has(p.reportsTo)) {
      p.reportsTo = null;
    }
    if (p.dottedReportsTo && !idSet.has(p.dottedReportsTo)) {
      p.dottedReportsTo = null;
    }
  }

  // Simple cycle detection for reportsTo
  for (const p of validPeople) {
    const visited = new Set();
    let current = p.reportsTo;
    while (current) {
      if (visited.has(current)) {
        // Break the cycle at this person
        p.reportsTo = null;
        break;
      }
      visited.add(current);
      const parent = validPeople.find(pp => pp.id === current);
      current = parent?.reportsTo;
    }
  }

  // Validate groups
  const validGroups = [];
  if (Array.isArray(orgChart.groups)) {
    for (const raw of orgChart.groups) {
      if (!raw || typeof raw !== 'object') continue;
      if (!Array.isArray(raw.personIds) || raw.personIds.length < 2) continue;
      const personIds = raw.personIds.filter(pid => idSet.has(pid));
      if (personIds.length < 2) continue;
      validGroups.push({
        id: raw.id || crypto.randomUUID(),
        personIds,
        label: (typeof raw.label === 'string' && raw.label) ? raw.label : 'Group',
      });
    }
  }

  return {
    name: orgChart.name,
    people: validPeople,
    groups: validGroups,
    viewport: orgChart.viewport || null,
  };
}
