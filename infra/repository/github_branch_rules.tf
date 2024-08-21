resource "github_branch_default" "default_master" {
  repository = github_repository.this.name
  branch     = "master"
}

resource "github_branch_protection" "protection_master" {
  repository_id = github_repository.this.name
  pattern       = "master"

  required_status_checks {
    strict   = false
    contexts = [
      "io-functions-services.code-review",
    ]
  }

  require_conversation_resolution = false

  #tfsec:ignore:github-branch_protections-require_signed_commits
  require_signed_commits = false

  force_push_bypassers = []

  required_pull_request_reviews {
    dismiss_stale_reviews           = false
    require_code_owner_reviews      = true
    required_approving_review_count = 1
    dismissal_restrictions          = []
    pull_request_bypassers          = []
    restrict_dismissals             = false
  }

  restrict_pushes {
      blocks_creations = false
      push_allowances  = [
          "pagopa/io-backend-admin",
          "pagopa/io-backend-contributors",
          "pagopa/engineering-team-cloud-eng",
        ]
    }

  allows_deletions = false
}