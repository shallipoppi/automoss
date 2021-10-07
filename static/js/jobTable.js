// Setup the jobs table for searching.
let jobsTable = document.getElementById('job-table');
let jobsSearchBar = document.getElementById('job-search-bar');
setupTableSearch(jobsTable, jobsSearchBar);

let jobsTableBody = jobsTable.getElementsByTagName('tbody')[0];
let noJobsMessage = document.getElementById('no-jobs-message');

const terminalStates = [completedStatus, failedStatus];
const timelineEventMapping = {
	"INQ": 1,
	"UPL": 2,
	"PRO": 3,
	"PAR": 4,
	"COM": 99 // Don't set to 5 as this implies the "completed" state can be "in progress".
};

/**
 * Determine whether a state provided is a terminal state (i.e., COMPLETED and FAILED) or not.
 */ 
function isTerminalState(state){
	return terminalStates.includes(state);
}

/**
 * Return the last event that completed before the job failed.
 */
function getLastCompletedEvent(jobId){
	let prevEvents = document.getElementById(`job-logs-${jobId}`).prevEvents;
	if (prevEvents != undefined){
		for (let i = prevEvents.length - 1; i >= 0; i--){
			if (Object.hasOwn(timelineEventMapping, prevEvents[i])){
				return timelineEventMapping[prevEvents[i]];
			}
		}
	}
	return 0; // No previous events, therefore job failed to be created.
}

/**
 * Update the status (badge and timeline) for a job in the table.
 */
function updateJobStatus(jobId, status){
	// Badge
	document.querySelector(`tr[job_id="${jobId}"]`).setStatus(status);
	if(isTerminalState(status)){
		unfinishedJobs = unfinishedJobs.filter(item => item !== jobId);
	}
	// Timeline
	let jobTimeline = document.getElementById(`job-timeline-${jobId}`);
	if (status != "FAI"){
		jobTimeline.setProgress(timelineEventMapping[status], true);
	}else{
		jobTimeline.setProgress(getLastCompletedEvent(jobId), false);
	}
}

/**
 * Update the logs for a job in the table.
 */
function updateJobLogs(jobId, logs){
	let jobLogs = document.getElementById(`job-logs-${jobId}`);

	let tmpLogs = "";
	jobLogs.prevEvents = [];

	for (let log in logs){
		tmpLogs += logs[log].str + "\n";
		if (logs[log].type){
			jobLogs.prevEvents.push(logs[log].type); // Record previous events.
		}
	}
	tmpLogs = trimRight(tmpLogs, 1); // Remove last newline character.

	if (tmpLogs !== jobLogs.prevLogs){
		jobLogs.prevLogs = jobLogs.innerHTML = tmpLogs;
	}
}

/**
 * Retrieve a list of jobs (based on the list of ids provided) and perform an operation on each of them.
 */
async function performOperationOnJobs(url, jobIds, operation){
	let result = await fetch(url + "?" + new URLSearchParams({job_ids: jobIds}));
	let json = await result.json();
	for (let key in json){
		operation(key, json[key]);
	}
}

/**
 * Update all the jobs in the table.
 */
async function updateJobs(jobs){
	await performOperationOnJobs(GET_JOB_LOGS_URL, jobs, updateJobLogs);
	await performOperationOnJobs(GET_JOB_STATUSES_URL, jobs, updateJobStatus);
}

/**
 * Add a job to the jobs table. If force open is set, the job's info collapsible will be toggled
 * open by default. (Necessary when creating the job using the job submission modal).
 */
function addJob(job, forceOpen=false){
	noJobsMessage.style.display = 'none';

	// Info
	let jobInfoRow = document.createElement("tr");

	let jobInfo = document.createElement("td");
	jobInfoRow.append(jobInfo);
	jobInfo.setAttribute("colspan", "6");
	jobInfo.style = "padding: 0 !important;";
	jobInfo.setAttribute("ignoreOnSearch", true);

	// Info > Collapse
	let jobInfoCollapse = document.createElement("div");
	jobInfo.append(jobInfoCollapse);
	jobInfoCollapse.id = `job-info-${job.job_id}`;
	jobInfoCollapse.classList.add("collapse");
	jobInfoCollapse.classList.add("p-0");
	jobInfoCollapse.classList.add("border-bottom");
	

	let jobInfoWrapper = document.createElement("div");
	jobInfoCollapse.append(jobInfoWrapper);
	jobInfoWrapper.style.height = "200px";
	jobInfoWrapper.classList.add("d-flex");

	// Info > Collapse > Timeline
	let jobTimeline = new Timeline();
	jobInfoWrapper.append(jobTimeline);
	jobTimeline.id = `job-timeline-${job.job_id}`;
	jobTimeline.style.width = "50%";

	// Info > Collapse > Logs
	let jobLogs = document.createElement("textarea");
	jobInfoWrapper.append(jobLogs);
	jobLogs.id = `job-logs-${job.job_id}`;
	jobLogs.classList.add("my-4");
	jobLogs.classList.add("me-4");
	jobLogs.classList.add("container");
	jobLogs.style = "resize: none; background-color: white; border-radius: 10px; padding: 6px 10px; border-color: var(--bs-gray-300)";
	jobLogs.style.width = "50%";
	jobLogs.setAttribute("readonly", true);

	jobTimeline.addEvent("Created");
	jobTimeline.addEvent("In Queue");
	jobTimeline.addEvent("Uploading");
	jobTimeline.addEvent("Processing");
	jobTimeline.addEvent("Parsing");
	jobTimeline.addEvent("Completed");

	if (forceOpen){
		jobInfoCollapse.classList.add("show");
	}
	jobTimeline.setProgress(1, true);

	jobsTableBody.prepend(jobInfoRow);
	let jobElement = new Job(job, jobInfo);
	jobElement.setAttribute("ownsNext", true);
	jobsTableBody.prepend(jobElement);
}

let unfinishedJobs = [];
let result = fetch(GET_JOBS_URL).then(async (response)=>{
	let json = await response.json();
	let jobIDs = [];
	json.forEach(item => {
		addJob(item);
		if (!isTerminalState(item.status)){
			unfinishedJobs.push(item.job_id);
		}
		jobIDs.push(item.job_id);
	});

	updateJobs(jobIDs); // Update all jobs on load.
	if(json.length == 0){
		noJobsMessage.style.display = 'block';
	}
});

// Update the status and event logs of all unfinished jobs in the table.
setInterval(async function(){
	if(unfinishedJobs.length != 0){		
		updateJobs(unfinishedJobs);
	}
}, POLLING_TIME);

// Update the duration of all unfinished jobs in the table every second.
setInterval(async function(){
	for (let jobId of unfinishedJobs){
		let job = document.getElementById(`job-${jobId}`);
		if (!isTerminalState(job.status)){
			job.updateDuration();
		}
	}
}, 1000);