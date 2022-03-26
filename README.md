# Repo filetree action

This action creates a filetree file from a repository.

## Inputs

* `repo-owner` - **Required** - The owner of the repository to use.
* `repo-name` - **Required** - The name of the repository to use.
* `repo-commit` - **Required** - The branch name to use, or the full sha1 string of a commit.
* `github-pat` - **Required** - A [Personal Access Token](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/creating-a-personal-access-token) to use for fetching repository data.
* `output-path` - **Required** - The path where the filetree file should be created.
* `prettify` - **Optional** - If the created JSON file should be in pretty format or not.

## Outputs

* `success` If source map creation was successful or not. Either `true` or `false`.
* `message` An error message if source map creation was not successful, or `"Success!"` if successful.

## Example usage

```yaml
uses: filiptibell/repo-filetree-action@v1.0
with:
  repo-owner: 'my-github-username'
  repo-name: 'my-cool-rojo-project'
  repo-commit: 'main'
  github-pat: 'ghp_abcdef1234567890'
  output-path: 'bin/FileTree.json'
  prettify: true
```
