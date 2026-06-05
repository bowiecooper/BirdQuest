import { supabase } from './supabase.ts';
import type { SpeciesPrediction } from '../types/predict.ts';

interface SaveSightingArgs {
  userId: string;
  file: File;
  /** The species the user confirmed (one of the top-5). */
  chosen: SpeciesPrediction;
  /** The full top-5, preserved as model_top5 for the retraining flywheel. */
  top5: SpeciesPrediction[];
  notes?: string;
}

/**
 * Upload the photo to Storage and insert the confirmed sighting. The model's
 * class_index is resolved to the species PK; the full prediction is preserved.
 */
export async function saveSighting({
  userId,
  file,
  chosen,
  top5,
  notes,
}: SaveSightingArgs): Promise<void> {
  // 1. Resolve the species row from the model's class_index.
  const { data: species, error: speciesError } = await supabase
    .from('species')
    .select('id')
    .eq('class_index', chosen.class_index)
    .single();
  if (speciesError) throw speciesError;

  // 2. Upload the photo to the user's own folder (Storage RLS enforces this).
  const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
  const path = `${userId}/${crypto.randomUUID()}.${ext}`;
  const { error: uploadError } = await supabase.storage
    .from('sightings')
    .upload(path, file, { contentType: file.type });
  if (uploadError) throw uploadError;

  const {
    data: { publicUrl },
  } = supabase.storage.from('sightings').getPublicUrl(path);

  // 3. Insert the sighting.
  const { error: insertError } = await supabase.from('sightings').insert({
    user_id: userId,
    species_id: species.id,
    photo_url: publicUrl,
    model_confidence: chosen.probability,
    model_top5: top5,
    notes: notes || null,
    status: 'confirmed',
  });
  if (insertError) throw insertError;
}
