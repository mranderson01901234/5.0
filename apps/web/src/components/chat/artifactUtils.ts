import { FileText, Grid, Sheet, ImageIcon } from '../../icons';
import { Artifact } from '../../store/artifactStore';

export const getArtifactIcon = (type: Artifact['type']) => {
  switch (type) {
    case 'table':
      return Grid;
    case 'doc':
      return FileText;
    case 'sheet':
      return Sheet;
    case 'image':
      return ImageIcon;
    default:
      return FileText; // Default icon
  }
};
