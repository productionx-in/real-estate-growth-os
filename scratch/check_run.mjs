async function run() {
  const prRes = await fetch('https://api.github.com/repos/productionx-in/real-estate-growth-os/pulls/1');
  const pr = await prRes.json();
  console.log(`PR 1: state=${pr.state} mergeable=${pr.mergeable} mergeable_state=${pr.mergeable_state} head=${pr.head?.sha?.slice(0, 8)} base=${pr.base?.sha?.slice(0, 8)}`);

  const runsRes = await fetch('https://api.github.com/repos/productionx-in/real-estate-growth-os/actions/runs?per_page=5');
  const data = await runsRes.json();
  for (const r of data.workflow_runs || []) {
    console.log(`Run ${r.id}: ${r.name} | status: ${r.status} | conclusion: ${r.conclusion} | head: ${r.head_sha.slice(0, 8)} | branch: ${r.head_branch}`);
  }
}
run();
