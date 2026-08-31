{
  DetectorName,
  Verified,
  VerificationFromCache,
  SourceType: (
    if (.SourceMetadata.Data? | type) == "object"
    then (.SourceMetadata.Data | keys_unsorted[0] // null)
    else null
    end
  ),
  Git: (
    if (.SourceMetadata.Data.Git? | type) == "object"
    then {
      commit: .SourceMetadata.Data.Git.commit,
      file: .SourceMetadata.Data.Git.file,
      line: .SourceMetadata.Data.Git.line
    }
    else null
    end
  )
}
