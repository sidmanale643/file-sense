import { getFileType, type FileType } from '../types';
import './FileIcon.css';

interface FileIconProps {
    filename: string;
    size?: 'sm' | 'md' | 'lg';
}

const iconPaths: Record<FileType, string> = {
    pdf: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm-1 7V3.5L18.5 9H13zm-4 5.5v3h1.5a1.5 1.5 0 0 0 0-3H9zm-3 0v5h1v-2h.5a2 2 0 0 0 0-3H6zm8.5 0v5h1v-5h-1zm-8 1h.5a1 1 0 0 1 0 2H6v-2z',
    doc: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm-1 7V3.5L18.5 9H13zM7 13h10v1H7v-1zm0 3h10v1H7v-1zm0 3h7v1H7v-1z',
    code: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm-1 7V3.5L18.5 9H13zm-4 4l-2 2 2 2-.7.7L5.6 15l2.7-2.7.7.7zm6 4l2-2-2-2 .7-.7 2.7 2.7-2.7 2.7-.7-.7z',
    text: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm-1 7V3.5L18.5 9H13zM7 13h10v1H7v-1zm0 3h10v1H7v-1zm0 3h7v1H7v-1z',
    image: 'M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zM5 19V5h14v9.59l-2.29-2.29a1 1 0 0 0-1.42 0L12 15.59l-1.29-1.3a1 1 0 0 0-1.42 0L5 18.59V19zm2-6a2 2 0 1 0 0-4 2 2 0 0 0 0 4z',
    unknown: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm-1 7V3.5L18.5 9H13z',
};

export function FileIcon({ filename, size = 'md' }: FileIconProps) {
    const fileType = getFileType(filename);

    return (
        <div className={`file-icon file-icon--${size} file-icon--${fileType}`}>
            <svg
                viewBox="0 0 24 24"
                fill="currentColor"
                xmlns="http://www.w3.org/2000/svg"
            >
                <path d={iconPaths[fileType]} />
            </svg>
        </div>
    );
}
