# Viva questions and honest answers

The questions below are likely ones for a viva panel. Each answer is short and true of the project as it is now. Where the repository has no evidence, the answer says so. Practise saying each answer in your own words, in under a minute.

## The idea

**What does the project do, in one sentence?**
Page Summarizer is a Chrome extension. It copies the main text of the page you are reading, sends it to Google's Gemini service with your own free key, and shows a short summary in a popup.

**Why build this when Copilot and other summarizers already exist?**
Those tools usually send the page to a vendor and ask for an account. This project uses a key you control, and it shows each step. The PRD states the difference in cost, data and control. It does not claim that the summaries are better than Copilot's.

**What is the difference between Version 1 and Version 2?**
Version 1 sends the text to Gemini in the cloud, with your key. Version 2 is planned to run a small model inside the browser, so no key and no network would be needed for a summary. Only the engine changes. Version 2 is not built.

**What was delivered for the midsem?**
The extension, its popup and options page, the setup and run scripts, the unit and browser tests, and the documents. The live runs recorded seven summaries: four from real websites and three from the test's own article pages. They also recorded two designed refusals, a page that was too long and a wrong key. The check in real Chrome has not yet been recorded.

## The user

**What must the user do before the first summary?**
Run `setup.bat` once and then `run.bat`. In Chrome, load the folder with Load unpacked and pin the icon. Then paste a free Gemini key and press Summarize on a page.

**Where is the key typed, and where is it kept?**
It is typed in the Key box in the popup, or on the Options page. It is saved in `chrome.storage.local` on this computer. It is not synced to a Google account.

**What happens if the popup closes during a summary?**
The service worker keeps going. When the popup opens again on the same page, it reads the same job record and shows the progress or the finished summary. Tests T11 and T16 check this.

**What happens if the user moves to another page during a summary?**
The old job is stopped, and the new page can be summarized. The old summary is hidden on the new page (test T17). An earlier bug left the popup blank in this case, and test T19 checks the fix.

**Can it summarize a Chrome settings page or a local file?**
No. Chrome's own pages, file addresses and the Web Store are refused with RESTRICTED_PAGE. PDFs and video pages are outside the project's scope.

## The code

**Walk me through what happens when the button is pressed.**
The popup sends a start message to the service worker and shows progress. The worker writes a job record, then places a reader script into the tab to copy the text. The pipeline checks the length, cuts the text into parts, sends each part to Gemini, merges the answers if there is more than one part, and writes the result. The popup shows it when the record changes.

**Why does the popup not call Gemini itself?**
A popup closes when the user clicks elsewhere, and that would end a summary still running. The service worker keeps the job and writes its state to storage, so the popup can close and reopen without losing the job.

**Why use Readability instead of the text of the whole page?**
Readability is built to find the article and drop the menus, adverts and footers, as requirement FR2 asks. The whole-page text includes all of that. The project uses the whole-page text only when Readability finds very little.

**How is a long page split?**
The chunker keeps whole paragraphs together, up to 8,000 characters. A paragraph that is too long is cut at sentence ends. A sentence still too long is cut at a space. Only a word with no space is cut in the middle.

**How are the parts merged?**
If the part summaries fit together in one request, they are merged in one request. If not, they are joined in groups, the groups are merged, and this repeats until one summary is left. In the live run of the Fresnel lens article, 7 parts gave 8 requests and one merge level.

**Why are the parts sent one after another?**
The code waits for each answer before it sends the next part. The repository does not measure parallel requests. Parallel requests would be faster, but the free tier limits requests per minute, so that trade-off would need measuring first.

**Where does the key go once it is saved?**
It is read from storage and put in a header of each request to Google's address. It is not put in the web address. The manifest lists that Google address as the only host the extension may contact.

**What does the prompt do, and does it stop instructions hidden in the page?**
The prompt asks for one sentence about the page, then three to six bullets, using only the text. The page text sits between markers and is labelled as content, not as instructions. That limits prompt injection, but does not remove it. The popup shows any markup from the model as plain text.

## The errors

**What does the user see with a wrong key?**
The message "Your API key was rejected. Paste a correct key in the Key box." appears, and the Key box opens. In the live run against the real service, the rejection came back in about half a second (run L09).

**What happens when the service is busy?**
The engine waits 2, 4 and then 8 seconds, and tries again up to three more times. The popup shows "The service is busy. Trying again in N s". If every attempt fails, the job stops with the busy message (tests T05 and T06).

**What happens when the daily quota is used up?**
If Google asks for a wait longer than 25 seconds, the engine stops at once and says how long to wait, for example "about 7 hours". It does not retry, because a retry cannot help before the quota resets (test T24).

**Why does a 403 not always mean a wrong key?**
A 403 whose message mentions location or region is a service problem, not a key problem. The engine checks for those words and reports SERVICE_ERROR (`gemini.js` line 63). The first test review found that every 403 had been reported as a bad key, and this was the fix.

**What if Chrome stops the service worker during a job?**
The next time the worker starts, it marks the unfinished job as INTERRUPTED. The popup then tells the user to press Summarize again (test T18).

## The tests

**What kinds of tests are there?**
Unit tests run in Node, and check the chunker, merger, pipeline, engine, settings and errors. The project has 65 of them in six files. Browser tests load the real extension in Chromium, with 28 tests, including the smoke test. The real-Chrome install is a separate manual check.

**Why use a mock server?**
The mock is a stand-in for Google's address. It is fast, free and repeatable, and it can fail on purpose, for example with busy or server errors. It also checks the key header, as the real service does. It does not prove that the real model writes good summaries.

**What did the first browser run find?**
The first run had 25 scenarios. Twenty-one passed and four failed, and the four failures were real bugs. A new-page press gave no reply, a popup stayed busy after its worker died, table cells ran together, and a stored record was left after a tab closed. Each was fixed. The second run recorded 26 browser passes and 60 unit passes (`run-1.md` and `run-2.md`).

**Do the tests pass on the current code?**
The newest report in the repository is run 3: 65 unit tests and 28 browser tests, and all of them passed. Run `npm test` and `npm run test:e2e` before the viva to see the same result yourself.

**Has the install been tested in the real Chrome?**
Not in the repository yet. The manual test has eleven steps, and its results column is empty. The flag check showed that branded Chrome does not load an extension from a command-line flag, so the Load unpacked path is the one that matters, and it is the one still to record.

## The decisions

**Why a popup, and not a new tab?**
The owner asked that the extension should not open tabs. A popup opens inside the toolbar window, and the key can be typed into it, so the user never has to leave it. A popup closes when you click away, so the work runs in the service worker. The Options page still opens a tab, and that is the one exception.

**Why JavaScript and not TypeScript?**
The client should not need a build step, and plain JavaScript runs as it is. The cost is that no compiler checks the types. The unit tests and the JSDoc comments do that job instead.

**Why Gemini and not NVIDIA?**
The PRD left the provider open. The V1 plan chose Gemini because it needs one REST call, has a free tier and needs only a simple key. The NVIDIA option was not built or measured.

**Why this model?**
The benchmark sent the same input to each model. The chosen model answered in about 1.6 to 2.0 seconds. The bigger model took 11 to 13 seconds with its default thinking setting. The quota probe also found that the chosen model allowed 15 requests before the limit message, the highest of the three models that reached a limit. The benchmark did not compare summary quality.

**Why store the key in chrome.storage.local and not in sync storage?**
Sync storage copies data to the user's Google account. The key should stay on the computer where it was typed.

## The limits

**What if the key leaks?**
The key is stored unencrypted on this computer. Anyone who can read this Chrome profile can read it. You can remove it with Remove saved key in the popup and paste a new one. The repository does not describe revoking a key at Google, so that step lies outside what the project tests. The key is sent only to Google, and `scripts/secret-scan.mjs` checks the project files for it before a push.

**Why not run it offline in Version 1?**
Version 1 is defined in the PRD as the cloud version. Offline use is Version 2 (requirements FR6 and FR7). No local model is built, so nothing can run offline yet. That is the design, not something that was missed.

**How do you know the summary is good?**
The repository does not measure summary quality. The live summaries are saved in `docs/test-runs/live-summaries.md`, exactly as the popup showed them, and one phrase in the MDN summary reads oddly. The model can still get a fact wrong, so the honest check is for a person to compare the summary with the page. Accuracy is [to be measured].

**Why refuse a long page instead of summarizing part of it?**
The limit protects the free quota, because a page over 30 parts would make many requests. In a test run with the limit lowered to 10 parts, the World War II article needed 22 parts and was refused with TOO_LONG before any request was sent. The user can try a shorter page.

**Why split the text at all, when a large cloud model could take a long page in one request?**
The V1 plan says the honest answer is that a large cloud model does not strictly need splitting. The project keeps splitting because the pipeline is built for Version 2, where the model has a smaller limit. The live runs show the path works. They do not show that splitting gives better summaries.

**What would break first on a very long page?**
The free-tier limit or the time. Each part is one request with a 25-second limit, and the parts run one after another. The Fresnel lens article took 23 seconds for 8 requests. A page over 30 parts is refused.

**What is the biggest weakness of the project?**
There are three main weaknesses. Summary quality is not measured. The summaries depend on Google's free service and its limits. The key is stored unencrypted. The repository also does not measure how Chrome times the service worker.

## The future

**What would Version 2 change?**
Version 2 is planned to replace the cloud engine with a small model that runs inside the browser, so a summary would need no key and no network. The chunker, merger, pipeline, popup and error handling are planned to stay as they are. Version 2 is not built, so none of its results exist yet.

**What is the engine seam?**
The pipeline talks to the engine through two functions: one that summarizes a part, and one that merges summaries. Any engine that offers those two functions can be plugged in. The pipeline itself does not change.

**What must still be done before the midsem demo?**
Record the manual install steps in real Chrome. Run both test suites on the current code and record the results. Update the wording in the manual test document so it matches the messages the popup shows.
