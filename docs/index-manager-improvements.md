# Index Manager Improvements Plan

## Current State Analysis

The IndexManager (`frontend/src/components/IndexManager.tsx`) provides basic folder management functionality:
- Add/remove folders from index
- View index statistics (folders, files, chunks, size)
- List indexed folders with metadata
- View files within folders (paginated)
- Reindex folders
- Clear entire index

**Backend Support:** The backend has comprehensive folder management APIs in `src/main.py` and `src/services/file_manager.py`.

---

## Improvement Plan

### Priority 1: User Experience Enhancements

#### 1.1 Native Folder Picker
**Problem:** Users must manually type folder paths, which is error-prone.

**Solution:** Implement a native folder picker dialog.

**Implementation:**
```typescript
// Add to IndexManager.tsx
const handleBrowseFolder = async () => {
  // Use Electron's dialog API or fallback to manual input
  // For web: could show instructions or use File System Access API
};
```

**Files to modify:**
- `frontend/src/components/IndexManager.tsx` - Add browse button
- `frontend/src/components/IndexManager.css` - Style browse button
- May need backend endpoint for folder browser (optional)

---

#### 1.2 Real-Time Progress Feedback for Indexing
**Problem:** Large folder indexing shows no progress indicator.

**Solution:** Add progress bar and file count updates during indexing.

**Implementation:**
- Backend: Add SSE endpoint for indexing progress
- Frontend: Subscribe to progress updates with EventSource
- Show progress bar and "Processed X/Y files" message

**Files to modify:**
- `src/main.py` - Add `/folders/{path}/index/progress` SSE endpoint
- `src/services/pipeline.py` - Emit progress events during indexing
- `frontend/src/components/IndexManager.tsx` - Add progress UI
- `frontend/src/components/IndexManager.css` - Add progress bar styles

---

#### 1.3 File Search and Filter Within Folder
**Problem:** When viewing files in a folder, no way to search/filter.

**Solution:** Add search input and file type filter dropdown.

**Implementation:**
- Add search input above file list
- Add file type filter (PDF, TXT, DOCX, etc.)
- Filter files client-side for instant feedback

**Files to modify:**
- `frontend/src/components/IndexManager.tsx` - Add search/filter UI
- `frontend/src/components/IndexManager.css` - Style new controls

---

### Priority 2: Functional Enhancements

#### 2.1 Edit Folder Settings
**Problem:** Can't change recursive setting without re-adding folder.

**Solution:** Add edit modal to modify folder settings.

**Implementation:**
- Add "Edit" button to folder actions
- Show modal with recursive toggle
- Update backend and refresh folder list

**Files to modify:**
- `frontend/src/components/IndexManager.tsx` - Add edit functionality
- `frontend/src/components/IndexManager.css` - Add modal styles
- Backend already supports this via `reindexFolder`

---

#### 2.2 File-Level Operations
**Problem:** Can't remove individual files from index.

**Solution:** Add delete button to each file in the file list.

**Implementation:**
- Add delete button to file items
- Confirm before deleting
- Call `/unindex` endpoint with file hash
- Update UI to reflect removal

**Files to modify:**
- `frontend/src/components/IndexManager.tsx` - Add file delete action
- `frontend/src/components/IndexManager.css` - Style file actions
- `frontend/src/services/api.ts` - Ensure unindex API is callable

---

#### 2.3 Duplicate File Viewer
**Problem:** Backend can find duplicates (`/duplicates`) but no UI.

**Solution:** Add duplicates section to IndexManager.

**Implementation:**
- Add "Duplicates" tab or section
- Fetch duplicates from `/duplicates` endpoint
- Show duplicate groups with file paths
- Allow keeping one copy and deleting others

**Files to modify:**
- `frontend/src/components/IndexManager.tsx` - Add duplicates view
- `frontend/src/components/IndexManager.css` - Style duplicates list
- `frontend/src/types/index.ts` - Add Duplicate type definition

---

#### 2.4 Failed Files View
**Problem:** No visibility into which files failed to index.

**Solution:** Add error tracking and display.

**Implementation:**
- Backend: Track failed file attempts in database
- Frontend: Show failed files count and list
- Allow retry on failed files

**Files to modify:**
- `src/services/file_manager.py` - Add failed_files table
- `src/services/pipeline.py` - Log failed files
- `src/main.py` - Add `/failed_files` endpoint
- `frontend/src/components/IndexManager.tsx` - Show failed files UI

---

### Priority 3: Visual & Data Improvements

#### 3.1 File Type Distribution Visualization
**Problem:** Index stats show numbers but no visual breakdown.

**Solution:** Add bar chart or donut chart showing file type distribution.

**Implementation:**
- Use `file_types` from `IndexStats`
- Render simple CSS-based bar chart (avoid heavy chart libraries)
- Show file type, count, and percentage

**Files to modify:**
- `frontend/src/components/IndexManager.tsx` - Add chart component
- `frontend/src/components/IndexManager.css` - Style chart bars

---

#### 3.2 Index Health Indicators
**Problem:** No way to tell if index is healthy or needs attention.

**Solution:** Add health checks and indicators.

**Implementation:**
- Check for orphaned chunks (files removed but chunks remain)
- Check for duplicate detection
- Show "Healthy", "Warnings", or "Errors" status
- Add "Fix Issues" button

**Files to modify:**
- `src/main.py` - Add `/index/health` endpoint
- `src/services/file_manager.py` - Implement health check logic
- `frontend/src/components/IndexManager.tsx` - Add health status UI
- `frontend/src/components/IndexManager.css` - Style status indicators

---

#### 3.3 Index Export/Import
**Problem:** No way to backup or migrate index.

**Solution:** Add export/import functionality.

**Implementation:**
- Export: Serialize index metadata to JSON (not FAISS/BM25 data)
- Import: Load metadata and rebuild index from exported file
- Add buttons to index manager header

**Files to modify:**
- `src/main.py` - Add `/index/export` and `/index/import` endpoints
- `src/services/pipeline.py` - Implement export/import logic
- `frontend/src/components/IndexManager.tsx` - Add export/import UI
- `frontend/src/components/IndexManager.css` - Style action buttons

---

### Priority 4: Performance & State Management

#### 4.1 Auto-Refresh / Polling
**Problem:** Manual refresh needed to see updates from background indexing.

**Solution:** Add configurable auto-refresh.

**Implementation:**
- Add refresh interval setting (default: 30 seconds)
- Use `useEffect` with interval to refresh stats
- Pause refresh when IndexManager is closed
- Show last updated timestamp

**Files to modify:**
- `frontend/src/components/IndexManager.tsx` - Add polling logic
- `frontend/src/components/IndexManager.css` - Show last updated time

---

#### 4.2 Optimistic UI Updates
**Problem:** Actions feel slow due to waiting for backend response.

**Solution:** Update UI optimistically, rollback on error.

**Implementation:**
- Update folder list immediately when adding/deleting
- Show loading indicator for the specific action
- Rollback if API call fails
- Use React Query or SWR for better cache management (optional)

**Files to modify:**
- `frontend/src/components/IndexManager.tsx` - Refactor state updates

---

#### 4.3 Keyboard Shortcuts
**Problem:** No keyboard navigation support.

**Solution:** Add keyboard shortcuts for power users.

**Shortcuts to implement:**
- `Cmd/Ctrl + K` - Focus search input
- `Escape` - Close IndexManager
- `Arrow Down/Up` - Navigate folder list
- `Enter` - Expand/collapse selected folder
- `Cmd/Ctrl + N` - Focus new folder input

**Files to modify:**
- `frontend/src/components/IndexManager.tsx` - Add keydown handlers
- Document shortcuts in UI (help tooltip)

---

### Priority 5: Accessibility Improvements

#### 5.1 Screen Reader Support
**Problem:** Not optimized for screen readers.

**Solution:** Add ARIA labels and semantic markup.

**Implementation:**
- Add `aria-label` to all icon-only buttons
- Use `role="status"` for error/success messages
- Add `aria-live` regions for dynamic content
- Ensure keyboard navigation works logically

**Files to modify:**
- `frontend/src/components/IndexManager.tsx` - Add ARIA attributes

---

#### 5.2 Focus Management
**Problem:** Focus isn't managed when opening/closing.

**Solution:** Trap focus within modal and return focus on close.

**Implementation:**
- Store previously focused element on open
- Focus first interactive element on open
- Return focus on close
- Trap focus within IndexManager using Tab/Shift+Tab

**Files to modify:**
- `frontend/src/components/IndexManager.tsx` - Add focus management
- `frontend/src/components/IndexManager.css` - Add focus-visible styles

---

## Implementation Phases

### Phase 1: Quick Wins (1-2 days)
- Folder search/filter within files
- File-level delete operations
- Keyboard shortcuts
- ARIA labels and basic accessibility

### Phase 2: Core Features (3-5 days)
- Native folder picker
- Edit folder settings modal
- Real-time progress feedback (SSE)
- File type distribution visualization

### Phase 3: Advanced Features (5-7 days)
- Duplicate file viewer UI
- Failed files tracking
- Index health indicators
- Export/import functionality

### Phase 4: Polish (2-3 days)
- Auto-refresh/polling
- Optimistic UI updates
- Focus management
- Documentation and testing

---

## Technical Considerations

### State Management
Current implementation uses React `useState`. Consider:
- Extract to custom hook: `useIndexManager()`
- Consider React Query for API caching
- Consider Zustand for global state if sharing data

### Styling
Current CSS is well-structured with CSS variables. Continue:
- Use existing CSS variables for consistency
- Follow minimal theme pattern
- Ensure responsive design for smaller screens

### Performance
- Virtualize file list for large folders (react-window)
- Debounce search input (already done in SearchInput, reuse pattern)
- Lazy load folder file data
- Cache API responses appropriately

---

## File Summary

### Files to Create
- `frontend/src/hooks/useIndexManager.ts` - Extract state management
- `frontend/src/components/DirectoryPicker.tsx` - Folder picker component (if needed)
- `frontend/src/components/DuplicatesViewer.tsx` - Standalone duplicates viewer
- `frontend/src/components/FileDistributionChart.tsx` - File type chart

### Files to Modify
- `frontend/src/components/IndexManager.tsx` - Main component
- `frontend/src/components/IndexManager.css` - Styles
- `frontend/src/services/api.ts` - Add new API functions
- `frontend/src/types/index.ts` - Add new type definitions
- `src/main.py` - Add new endpoints
- `src/services/pipeline.py` - Add progress tracking
- `src/services/file_manager.py` - Add health check, failed files tracking

---

## Success Metrics

- **Usability:** Time to add/remove folders reduced by 50%
- **Visibility:** Users can see all indexed content and issues
- **Performance:** Actions feel responsive (< 200ms perceived latency)
- **Accessibility:** WCAG 2.1 AA compliant
- **Reliability:** Graceful error handling and recovery

